import {
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { LinkedInImport } from '../entities/linkedin-import.entity';
import { LinkedInImportStatus } from '../enum/linkedin-import-status.enum';
import { NewsPost } from '../entities/news-post.entity';
import { NewsService } from '../news.service';
import { StorageService } from '@/storage/storage.service';
import { MediaReferencesService } from '@/media/media-references.service';
import {
    DetectedFileType,
    detectFileType,
} from '@/storage/utils/file-signature.util';
import { paginate } from '@/common/utils/pagination.util';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';
import { LINKEDIN_SOURCE } from './linkedin-source.interface';
import type { LinkedInSource } from './linkedin-source.interface';
import { ApproveLinkedInImportDto } from '../dto/approve-linkedin-import.dto';
import { LinkedInQueueQueryDto } from '../dto/linkedin-queue-query.dto';

/**
 * Curaduría de posteos de LinkedIn: trae candidatos (sync), los lista en la
 * cola del panel y permite aprobarlos (se copian a news_posts y se publican) o
 * rechazarlos. El dedupe por externalId asegura que un candidato procesado
 * (aprobado o rechazado) no vuelva a aparecer en la cola en el próximo sync.
 */
@Injectable()
export class LinkedInImportService {
    private readonly logger = new Logger(LinkedInImportService.name);

    constructor(
        @InjectRepository(LinkedInImport)
        private readonly importRepository: Repository<LinkedInImport>,
        @Inject(LINKEDIN_SOURCE)
        private readonly source: LinkedInSource,
        private readonly newsService: NewsService,
        private readonly storageService: StorageService,
        private readonly mediaReferences: MediaReferencesService,
    ) {}

    /**
     * Trae los posteos recientes de la fuente y crea como pendientes los que no
     * existan aún. Los ya conocidos (en cualquier estado) se ignoran, así lo
     * rechazado no revive y lo aprobado no se duplica.
     */
    async sync(): Promise<{ fetched: number; created: number }> {
        const posts = await this.source.fetchRecentPosts();
        let created = 0;
        for (const post of posts) {
            const known = await this.importRepository.findOne({
                where: { externalId: post.externalId },
                select: { id: true },
            });
            if (known) {
                continue;
            }
            await this.importRepository.save(
                this.importRepository.create({
                    externalId: post.externalId,
                    status: LinkedInImportStatus.PENDING,
                    externalUrl: post.url,
                    text: post.text,
                    mediaUrl: post.mediaUrl,
                    authorName: post.authorName,
                    postedAt: post.postedAt,
                }),
            );
            created++;
        }
        this.logger.log(
            `Sync LinkedIn: ${posts.length} traídos, ${created} nuevos`,
        );
        return { fetched: posts.length, created };
    }

    /** Cola del panel. Por defecto muestra los pendientes. */
    async findQueue(
        query: LinkedInQueueQueryDto,
    ): Promise<PaginatedResult<LinkedInImport>> {
        const where: FindOptionsWhere<LinkedInImport> = {
            status: query.status ?? LinkedInImportStatus.PENDING,
        };
        const [items, total] = await this.importRepository.findAndCount({
            where,
            // NULLS LAST: en Postgres un DESC pone los NULL primero, y un post
            // sin fecha no debe quedar arriba de los recientes.
            order: {
                postedAt: { direction: 'DESC', nulls: 'LAST' },
                createdAt: 'DESC',
            },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
        });
        return paginate(items, total, query);
    }

    /**
     * Aprueba un candidato: descarga su imagen al almacenamiento (si tiene), crea y publica
     * la nota en news_posts y marca la importación como aprobada.
     */
    async approve(
        id: string,
        dto: ApproveLinkedInImportDto,
    ): Promise<NewsPost> {
        const candidate = await this.getPending(id);

        const coverImage = candidate.mediaUrl
            ? await this.downloadToMedia(candidate.mediaUrl)
            : null;

        const text = candidate.text?.trim() ?? '';
        const title = dto.title ?? this.deriveTitle(text, candidate.authorName);

        let post: NewsPost;
        try {
            post = await this.newsService.createFromLinkedIn({
                title,
                excerpt: dto.excerpt ?? (this.deriveExcerpt(text) || title),
                body: text || title,
                category: dto.category,
                isFeatured: dto.isFeatured ?? false,
                coverImage,
                externalUrl: candidate.externalUrl,
                publishedAt: candidate.postedAt ?? new Date(),
            });
        } catch (err) {
            // La imagen se descarga ANTES de crear la nota, así que entre las
            // dos hay una ventana en la que el archivo ya existe en el disco y
            // todavía no lo referencia nadie. Si la creación falla —un slug
            // repetido, la base caída— ese archivo se queda ahí para siempre:
            // el curador reintenta la aprobación y la descarga vuelve a
            // empezar, con otra key.
            //
            // Se limpia por deleteUnusedKeys, la misma vía que usa el resto del
            // proyecto, que antes de borrar verifica que nadie la esté usando.
            // Hoy no puede usarla nadie —createFromLinkedIn guarda dentro de
            // una transacción, así que si lanza no quedó ninguna nota— pero si
            // mañana eso cambia, esta limpieza no se convierte en el borrado de
            // un archivo en uso.
            //
            // El catch va acá y no se delega: lo que el curador necesita ver es
            // por qué no se pudo crear la nota, no un error de borrado. Que
            // deleteUnusedKeys ya se trague sus propios fallos es una garantía
            // de otra clase, y no corresponde apoyarse en ella para esto.
            if (coverImage) {
                await this.mediaReferences
                    .deleteUnusedKeys([coverImage])
                    .catch((fallo: unknown) => {
                        this.logger.warn(
                            `Quedó sin borrar ${coverImage} tras una aprobación fallida: ` +
                                (fallo instanceof Error
                                    ? fallo.message
                                    : String(fallo)),
                        );
                    });
            }
            throw err;
        }

        candidate.status = LinkedInImportStatus.APPROVED;
        candidate.newsPostId = post.id;
        candidate.reviewedAt = new Date();
        await this.importRepository.save(candidate);

        return post;
    }

    /** Rechaza un candidato: no se publica y no vuelve a la cola. */
    async reject(id: string): Promise<LinkedInImport> {
        const candidate = await this.getPending(id);
        candidate.status = LinkedInImportStatus.REJECTED;
        candidate.reviewedAt = new Date();
        return this.importRepository.save(candidate);
    }

    private async getPending(id: string): Promise<LinkedInImport> {
        const candidate = await this.importRepository.findOne({
            where: { id },
        });
        if (!candidate) {
            throw new NotFoundException('La importación no existe');
        }
        if (candidate.status !== LinkedInImportStatus.PENDING) {
            throw new ConflictException('Esa importación ya fue procesada');
        }
        return candidate;
    }

    /**
     * Descarga la media (URL http o data: URI) y la sube al bucket público.
     * Devuelve la key, o null si no se pudo descargar o el tipo no es una
     * imagen válida (best-effort: nunca bloquea la aprobación).
     */
    private async downloadToMedia(url: string): Promise<string | null> {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                return null;
            }
            const buffer = Buffer.from(await res.arrayBuffer());
            const meta = this.mediaMeta(detectFileType(buffer));
            if (!meta) {
                this.logger.warn(
                    'La media de LinkedIn no es una imagen soportada; se omite la portada',
                );
                return null;
            }
            const uploaded = await this.storageService.uploadMedia(
                buffer,
                meta.contentType,
                meta.extension,
            );
            return uploaded.key;
        } catch {
            this.logger.warn(
                `No se pudo descargar la media de LinkedIn (${url.slice(0, 80)})`,
            );
            return null;
        }
    }

    private mediaMeta(
        type: DetectedFileType | null,
    ): { contentType: string; extension: string } | null {
        switch (type) {
            case 'png':
                return { contentType: 'image/png', extension: 'png' };
            case 'jpeg':
                return { contentType: 'image/jpeg', extension: 'jpg' };
            case 'webp':
                return { contentType: 'image/webp', extension: 'webp' };
            default:
                // pdf u otros no son portadas válidas.
                return null;
        }
    }

    // Título tentativo: primera línea del texto (o el autor si no hay texto).
    private deriveTitle(text: string, author: string | null): string {
        if (!text) {
            return author ?? 'Novedad de LinkedIn';
        }
        const firstLine = text.split('\n')[0].trim();
        const base = firstLine || text;
        return base.length > 120 ? `${base.slice(0, 117).trimEnd()}…` : base;
    }

    // Extracto tentativo: recorte del texto a 300 caracteres.
    private deriveExcerpt(text: string): string {
        if (!text) {
            return '';
        }
        return text.length > 300 ? `${text.slice(0, 297).trimEnd()}…` : text;
    }
}
