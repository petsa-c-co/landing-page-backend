import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

/**
 * Imagen editable de una página fija del sitio (los banners de cabecera y las
 * fotos del inicio), identificada por un SLOT con nombre.
 *
 * Se modela como filas y no como columnas a propósito: sumar una página nueva
 * es insertar una fila desde el panel, sin migración ni deploy. El backend NO
 * mantiene un catálogo cerrado de slots — el frontend es dueño de la lista y
 * tiene una imagen por defecto en su código para cada uno, así que un slot sin
 * cargar no rompe nada.
 *
 * Slots en uso al momento de crear esta tabla:
 *   banner-nosotros · banner-servicios · banner-certificaciones ·
 *   banner-rrhh (lo comparten /rrhh y /trabaja-con-nosotros) ·
 *   banner-novedades · banner-contacto · home-hero · home-empresa
 *
 * NO incluye: el banner del detalle de cada servicio (Service.bannerImage), la
 * portada de cada nota (NewsPost.coverImage) ni el logo (asset del frontend).
 */
@Entity('site_images')
export class SiteImage extends BaseEntity {
    // Identificador del lugar donde se muestra, en kebab-case. Único: cada
    // slot tiene a lo sumo una imagen (se pisa, no se versiona).
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 60 })
    slot: string;

    // Key en el área pública del almacenamiento. El GET la expone como URL absoluta.
    @Column({ type: 'varchar', length: 500 })
    imageKey: string;
}
