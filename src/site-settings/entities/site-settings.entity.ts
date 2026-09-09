import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

/**
 * Configuración global del sitio: SINGLETON editable (una sola fila, sin
 * papelera ni histórico). El servicio lee siempre la primera fila y la crea si
 * no existe; el GET público devuelve los campos en null cuando aún no se cargó.
 */
@Entity('site_settings')
export class SiteSettings extends BaseEntity {
    // Key en el área pública del almacenamiento, de la marca de certificación de Bureau Veritas
    // del footer: UNA imagen que lista adentro todas las normas certificadas
    // (no confundir con Certification.logoImage, que es por norma).
    @Column({ type: 'varchar', length: 500, nullable: true })
    certificationMarkImage: string | null;

    // Alcance de la certificación, mostrado JUNTO a la marca. Requisito del
    // manual de Bureau Veritas (Rev. 14, §5 y §7) cuando el alcance no cubre
    // todos los procesos/sitios: visible, no detrás de un clic.
    @Column({ type: 'varchar', length: 1000, nullable: true })
    certificationScopeText: string | null;
}
