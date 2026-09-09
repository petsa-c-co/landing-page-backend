import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSettings } from './entities/site-settings.entity';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { StorageService } from '@/storage/storage.service';
import { orphanKeys } from '@/common/utils/orphan-keys.util';
import { MediaReferencesService } from '@/media/media-references.service';
import { SiteRevisionService } from '@/change-log/site-revision.service';

// Vista pública del singleton: solo los campos de contenido, con la imagen ya
// resuelta a URL absoluta (el footer la pega directo en un <img>).
export interface SiteSettingsView {
    certificationMarkImage: string | null;
    certificationScopeText: string | null;
    /**
     * Revisión del sitio para el footer: "03", o "00" si todavía está en su
     * línea de base.
     *
     * Es de SOLO LECTURA y se calcula del registro de cambios. NO está en la
     * entidad ni en UpdateSiteSettingsDto, y eso es deliberado: ese PATCH lo
     * puede escribir el rol AUDITOR, y un número que sube solo no puede ser
     * editable por nadie. Además el ValidationPipe global rechaza con 400
     * cualquier intento de mandarlo en el cuerpo.
     */
    revision: string;
    /** Día de la última revisión, `YYYY-MM-DD`. Null si no hubo ninguna. */
    revisionDate: string | null;
}

@Injectable()
export class SiteSettingsService {
    constructor(
        @InjectRepository(SiteSettings)
        private readonly siteSettingsRepository: Repository<SiteSettings>,
        private readonly storageService: StorageService,
        private readonly mediaReferences: MediaReferencesService,
        private readonly revisiones: SiteRevisionService,
    ) {}

    private async toView(
        settings: SiteSettings | null,
    ): Promise<SiteSettingsView> {
        const { revision, revisionDate } = await this.revisiones.actual();
        return {
            certificationMarkImage: settings?.certificationMarkImage
                ? this.storageService.publicUrl(settings.certificationMarkImage)
                : null,
            certificationScopeText: settings?.certificationScopeText ?? null,
            revision,
            revisionDate,
        };
    }

    // Singleton: siempre la primera fila (la más antigua, por si alguna vez
    // hubiera más de una por accidente).
    private findRow(): Promise<SiteSettings | null> {
        return this.siteSettingsRepository.findOne({
            where: {},
            order: { createdAt: 'ASC' },
        });
    }

    /** GET público: sin fila aún, devuelve los campos en null (nunca 404). */
    async get(): Promise<SiteSettingsView> {
        return this.toView(await this.findRow());
    }

    /** Upsert del singleton: crea la fila si no existe, la edita si existe. */
    async update(dto: UpdateSiteSettingsDto): Promise<SiteSettingsView> {
        const row =
            (await this.findRow()) ??
            this.siteSettingsRepository.create({
                certificationMarkImage: null,
                certificationScopeText: null,
            });

        // Se fotografía la key ANTES de mutar la fila; la limpieza se calcula
        // después del save comparando contra el valor final (mismo criterio que
        // el resto del CMS). Cubre tanto el reemplazo por otra key como la
        // limpieza explícita con null.
        const keyPrevia = row.certificationMarkImage;

        if (dto.certificationMarkImage !== undefined) {
            row.certificationMarkImage = dto.certificationMarkImage;
        }
        if (dto.certificationScopeText !== undefined) {
            row.certificationScopeText = dto.certificationScopeText;
        }

        const saved = await this.siteSettingsRepository.save(row);
        await this.mediaReferences.deleteUnusedKeys(
            orphanKeys([keyPrevia], [saved.certificationMarkImage]),
        );
        return this.toView(saved);
    }
}
