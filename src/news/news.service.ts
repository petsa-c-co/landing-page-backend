import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { NewsPost } from './entities/news-post.entity';
import { NewsCategory } from './enum/news-category.enum';
import { NewsSource } from './enum/news-source.enum';
import { CreateNewsPostDto } from './dto/create-news-post.dto';
import { UpdateNewsPostDto } from './dto/update-news-post.dto';
import { NewsQueryDto } from './dto/news-query.dto';
import { AdminNewsQueryDto } from './dto/admin-news-query.dto';
import { StorageService } from '@/storage/storage.service';
import { orphanKeys } from '@/common/utils/orphan-keys.util';
import { MediaReferencesService } from '@/media/media-references.service';
import { slugify } from '@/common/utils/slug.util';
import {
    restoreConflictException,
    uniqueConflictException,
} from '@/common/utils/unique-conflict.util';
import { paginate } from '@/common/utils/pagination.util';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';

@Injectable()
export class NewsService {
    constructor(
        @InjectRepository(NewsPost)
        private readonly newsRepository: Repository<NewsPost>,
        private readonly storageService: StorageService,
        private readonly mediaReferences: MediaReferencesService,
    ) {}

    private withImageUrl(post: NewsPost): NewsPost {
        if (post.coverImage) {
            post.coverImage = this.storageService.publicUrl(post.coverImage);
        }
        return post;
    }

    /**
     * Regla de negocio: a lo sumo UNA nota destacada (fuera de la papelera) —
     * es la card grande de /novedades-y-prensa. Guardar una nota destacada
     * des-marca la anterior EN LA MISMA transacción (atómico: sin ventana para
     * que queden dos, aunque dos usuarios marquen a la vez o se entre por API).
     * Cero destacadas es un estado válido (la página no muestra card grande).
     */
    private async saveEnforcingSingleFeatured(
        post: NewsPost,
    ): Promise<NewsPost> {
        return this.newsRepository.manager.transaction(async (em) => {
            const saved = await em.save(post);
            if (saved.isFeatured) {
                // Toca a lo sumo una fila (la que estaba destacada). Solo
                // notas vivas: una destacada EN PAPELERA conserva su flag y el
                // caso se resuelve al restaurar (ver restore()).
                //
                // Se carga y se guarda en vez de un em.update() directo: un
                // update de query builder no le da al registro de cambios el
                // estado previo, así que ese des-marcado quedaría sin rastro.
                // Es una fila: el costo de leerla primero es irrelevante.
                const anterior = await em.findOne(NewsPost, {
                    where: {
                        isFeatured: true,
                        id: Not(saved.id),
                        deletedAt: IsNull(),
                    },
                });
                if (anterior) {
                    anterior.isFeatured = false;
                    await em.save(anterior);
                }
            }
            return saved;
        });
    }

    private async assertSlugAvailable(
        slug: string,
        excludeId?: string,
    ): Promise<void> {
        // withDeleted: una nota en la papelera sigue "reservando" su slug
        // (índice único); así el mensaje es claro y restaurarla nunca choca.
        const existing = await this.newsRepository.findOne({
            where: { slug },
            withDeleted: true,
        });
        if (existing && existing.id !== excludeId) {
            throw uniqueConflictException('una nota', {
                id: existing.id,
                field: 'slug',
                value: slug,
                inTrash: existing.deletedAt !== null,
            });
        }
    }

    // Al restaurar: ninguna nota ACTIVA puede estar usando ese slug.
    private async assertSlugFreeForRestore(post: NewsPost): Promise<void> {
        const holder = await this.newsRepository.findOne({
            where: { slug: post.slug },
        });
        if (holder && holder.id !== post.id) {
            throw restoreConflictException('una nota', {
                id: holder.id,
                field: 'slug',
                value: post.slug,
                inTrash: false,
            });
        }
    }

    async findPublic(query: NewsQueryDto): Promise<PaginatedResult<NewsPost>> {
        const where: FindOptionsWhere<NewsPost> = { isPublished: true };
        if (query.category) {
            where.category = query.category;
        }
        if (query.featured !== undefined) {
            where.isFeatured = query.featured;
        }

        const [items, total] = await this.newsRepository.findAndCount({
            where,
            order: { publishedAt: 'DESC' },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
        });
        return paginate(
            items.map((p) => this.withImageUrl(p)),
            total,
            query,
        );
    }

    async findAdmin(
        query: AdminNewsQueryDto,
    ): Promise<PaginatedResult<NewsPost>> {
        const where: FindOptionsWhere<NewsPost> = {};
        if (query.category) {
            where.category = query.category;
        }
        if (query.featured !== undefined) {
            where.isFeatured = query.featured;
        }
        if (query.published !== undefined) {
            where.isPublished = query.published;
        }

        const [items, total] = await this.newsRepository.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
        });
        return paginate(
            items.map((p) => this.withImageUrl(p)),
            total,
            query,
        );
    }

    async findOneBySlug(slug: string): Promise<NewsPost> {
        const post = await this.newsRepository.findOne({
            where: { slug, isPublished: true },
        });
        if (!post) {
            throw new NotFoundException('La nota no existe');
        }
        return this.withImageUrl(post);
    }

    async findOneById(id: string): Promise<NewsPost> {
        const post = await this.newsRepository.findOne({ where: { id } });
        if (!post) {
            throw new NotFoundException('La nota no existe');
        }
        return this.withImageUrl(post);
    }

    async create(createDto: CreateNewsPostDto): Promise<NewsPost> {
        const slug = createDto.slug ?? slugify(createDto.title);
        await this.assertSlugAvailable(slug);

        const post = this.newsRepository.create({
            ...createDto,
            slug,
            // Al crear ya publicada sin fecha explícita, la fecha es ahora.
            publishedAt:
                createDto.publishedAt ??
                (createDto.isPublished ? new Date() : null),
        });
        const saved = await this.saveEnforcingSingleFeatured(post);
        return this.withImageUrl(saved);
    }

    /**
     * Crea y publica una nota a partir de una importación de LinkedIn ya
     * aprobada. A diferencia de create(), no valida un DTO de entrada y
     * garantiza un slug único (los títulos de LinkedIn pueden repetirse), en
     * vez de fallar con conflicto. Marca la nota con source = linkedin.
     */
    async createFromLinkedIn(input: {
        title: string;
        excerpt: string;
        body: string;
        category: NewsCategory;
        isFeatured: boolean;
        coverImage: string | null;
        externalUrl: string;
        publishedAt: Date;
    }): Promise<NewsPost> {
        const slug = await this.uniqueSlug(slugify(input.title) || 'novedad');
        const post = this.newsRepository.create({
            title: input.title,
            slug,
            category: input.category,
            publishedAt: input.publishedAt,
            coverImage: input.coverImage,
            excerpt: input.excerpt,
            body: input.body,
            isFeatured: input.isFeatured,
            isPublished: true,
            source: NewsSource.LINKEDIN,
            externalUrl: input.externalUrl,
        });
        const saved = await this.saveEnforcingSingleFeatured(post);
        return this.withImageUrl(saved);
    }

    // Devuelve `base`, o `base-2`, `base-3`... hasta encontrar un slug libre.
    private async uniqueSlug(base: string): Promise<string> {
        let candidate = base;
        let n = 2;
        while (
            await this.newsRepository.findOne({
                where: { slug: candidate },
                withDeleted: true,
            })
        ) {
            candidate = `${base}-${n++}`;
        }
        return candidate;
    }

    async update(id: string, updateDto: UpdateNewsPostDto): Promise<NewsPost> {
        const post = await this.newsRepository.findOne({ where: { id } });
        if (!post) {
            throw new NotFoundException('La nota no existe');
        }

        // Slug ESTABLE: editar el título no cambia la URL pública (rompería
        // links compartidos e indexados). Solo cambia si se envía explícito.
        const newSlug = updateDto.slug ?? post.slug;
        if (newSlug !== post.slug) {
            await this.assertSlugAvailable(newSlug, id);
        }

        // La portada anterior se borra del almacenamiento recién DESPUÉS del save: si el
        // save falla, la nota no debe quedar apuntando a un archivo borrado.
        const keyPrevia = post.coverImage;

        const merged = this.newsRepository.merge(post, {
            ...updateDto,
            slug: newSlug,
        });
        // Primera publicación sin fecha explícita -> fecha actual.
        if (updateDto.isPublished && !merged.publishedAt) {
            merged.publishedAt = new Date();
        }
        const saved = await this.saveEnforcingSingleFeatured(merged);
        await this.mediaReferences.deleteUnusedKeys(
            orphanKeys([keyPrevia], [saved.coverImage]),
        );
        return this.withImageUrl(saved);
    }

    // Borrado suave: va a la papelera (no se toca el almacenamiento, para poder restaurar).
    async remove(id: string): Promise<void> {
        const post = await this.newsRepository.findOne({ where: { id } });
        if (!post) {
            throw new NotFoundException('La nota no existe');
        }
        await this.newsRepository.softRemove(post);
    }

    // Papelera: notas borradas, más recientes primero.
    async findTrash(): Promise<NewsPost[]> {
        const posts = await this.newsRepository.find({
            withDeleted: true,
            where: { deletedAt: Not(IsNull()) },
            order: { deletedAt: 'DESC' },
        });
        return posts.map((p) => this.withImageUrl(p));
    }

    async restore(id: string): Promise<NewsPost> {
        const post = await this.newsRepository.findOne({
            where: { id },
            withDeleted: true,
        });
        if (!post) {
            throw new NotFoundException('La nota no existe');
        }
        if (!post.deletedAt) {
            throw new ConflictException('La nota no está en la papelera');
        }
        // Defensivo: la papelera reserva el slug (ver assertSlugAvailable).
        await this.assertSlugFreeForRestore(post);
        // Destacada única al restaurar: si mientras estaba en la papelera se
        // destacó OTRA nota, la restaurada vuelve SIN destacar (no le roba la
        // portada en silencio). Si no hay ninguna destacada, conserva la suya.
        let demote = false;
        if (post.isFeatured) {
            const otherFeatured = await this.newsRepository.findOne({
                where: { isFeatured: true, id: Not(post.id) },
            });
            demote = otherFeatured !== null;
        }
        await this.newsRepository.recover(post);
        if (demote) {
            // recover() solo limpia deletedAt; el des-marcado hay que
            // persistirlo aparte. Se hace con save() y no con update() para que
            // el registro de cambios vea el estado previo.
            post.isFeatured = false;
            await this.newsRepository.save(post);
        }
        return this.withImageUrl(post);
    }

    // Borrado físico definitivo desde la papelera: acá sí se limpia el almacenamiento.
    async removePermanent(id: string): Promise<void> {
        const post = await this.newsRepository.findOne({
            where: { id },
            withDeleted: true,
        });
        if (!post) {
            throw new NotFoundException('La nota no existe');
        }
        // Simétrico con restore(): el borrado definitivo es la SALIDA de la
        // papelera, así que exige haber entrado. Sin esto, un id de un registro
        // vivo lo destruye —a él y a sus archivos— sin vuelta atrás.
        if (!post.deletedAt) {
            throw new ConflictException(
                'La nota no está en la papelera. Enviála primero a la papelera para poder eliminarla definitivamente.',
            );
        }
        await this.newsRepository.remove(post);
        await this.mediaReferences.deleteUnusedKeys(
            [post.coverImage].filter((k): k is string => !!k),
        );
    }
}
