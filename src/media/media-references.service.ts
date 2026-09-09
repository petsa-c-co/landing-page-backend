import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { StorageService } from '@/storage/storage.service';
import { Service } from '@/services/entities/service.entity';
import { Certification } from '@/certifications/entities/certification.entity';
import { Client } from '@/clients/entities/client.entity';
import { NewsPost } from '@/news/entities/news-post.entity';
import { SiteSettings } from '@/site-settings/entities/site-settings.entity';
import { SiteImage } from '@/site-settings/entities/site-image.entity';

// Todas las columnas del catálogo que guardan keys del área pública. Si se
// agrega una entidad con archivos, hay que sumarla acá: es el único registro de
// "quién usa qué archivo", y de él dependen tanto el borrado manual desde el
// panel como la limpieza automática al reemplazar una imagen.
interface KeyReference {
    entity: EntityTarget<ObjectLiteral>;
    label: string;
    columns: readonly string[];
}

export const KEY_REFERENCES: readonly KeyReference[] = [
    {
        entity: Service,
        label: 'un servicio',
        columns: ['cardImage', 'bannerImage', 'detailImage'],
    },
    {
        entity: Certification,
        label: 'una certificación',
        columns: ['logoImage', 'certificatePdf'],
    },
    { entity: Client, label: 'un cliente', columns: ['logoImage'] },
    { entity: NewsPost, label: 'una novedad', columns: ['coverImage'] },
    {
        entity: SiteSettings,
        label: 'la configuración del sitio (marca de certificación)',
        columns: ['certificationMarkImage'],
    },
    {
        entity: SiteImage,
        label: 'una imagen de cabecera del sitio',
        columns: ['imageKey'],
    },
];

/**
 * Columnas que PARECEN guardar un archivo y no lo hacen.
 *
 * Existe para que el test de este registro pueda distinguir "no es una key del
 * almacenamiento" de "se olvidaron de sumarla". Sumar algo acá es una decisión
 * explícita que queda escrita; olvidarse, en cambio, ahora falla.
 */
export const COLUMNAS_SIN_ARCHIVO: ReadonlyMap<string, string> = new Map([
    [
        'LinkedInImport.mediaUrl',
        'Es la URL remota del posteo en LinkedIn, no una key nuestra. La imagen ' +
            'recién se descarga al aprobar la importación, y desde ahí vive como ' +
            'NewsPost.coverImage, que sí está en el registro.',
    ],
]);

/**
 * Saber si un archivo sigue en uso, y borrar los que no.
 *
 * Vive aparte de MediaService porque lo necesitan dos caminos distintos: el
 * borrado manual desde el panel (que rechaza con 409 si está en uso) y la
 * limpieza automática al reemplazar imágenes en cualquier módulo del CMS (que
 * simplemente saltea las que siguen referenciadas).
 *
 * Antes esta lógica vivía dentro de MediaService y ningún servicio del catálogo
 * la usaba: cada uno llamaba a storageService.deleteMedia() directo, sin
 * preguntar si otra entidad usaba ese mismo archivo.
 */
@Injectable()
export class MediaReferencesService {
    private readonly logger = new Logger(MediaReferencesService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly storageService: StorageService,
    ) {}

    /**
     * Etiqueta de la entidad que está usando la key, o null si está libre.
     *
     * Incluye la papelera a propósito: un registro borrado en soft conserva su
     * archivo para poder restaurarse completo.
     */
    async findReference(key: string): Promise<string | null> {
        for (const ref of KEY_REFERENCES) {
            const enUso = await this.dataSource.manager.exists(ref.entity, {
                where: ref.columns.map((columna) => ({ [columna]: key })),
                withDeleted: true,
            });
            if (enUso) {
                return ref.label;
            }
        }
        return null;
    }

    /**
     * Borra las keys que ya nadie usa. Best-effort: es limpieza posterior a una
     * operación que YA se guardó, así que un fallo acá no debe tumbar el
     * request. Lo que sí hace es dejar rastro en el log — antes estos errores se
     * tragaban en silencio y el sitio quedaba con imágenes rotas sin que nadie
     * se enterara.
     */
    async deleteUnusedKeys(keys: readonly string[]): Promise<void> {
        for (const key of keys) {
            try {
                const enUsoPor = await this.findReference(key);
                if (enUsoPor) {
                    this.logger.log(
                        `No se borra ${key}: la sigue usando ${enUsoPor}`,
                    );
                    continue;
                }
                await this.storageService.deleteMedia(key);
            } catch (err) {
                this.logger.warn(
                    `No se pudo borrar el archivo ${key}: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                );
            }
        }
    }
}
