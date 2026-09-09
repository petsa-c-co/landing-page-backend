import { Column, Entity } from 'typeorm';
import { SoftDeletableEntity } from '@/common/entities/soft-deletable.entity';

@Entity('certifications')
export class Certification extends SoftDeletableEntity {
    // Código/nombre de la norma, ej: "ISO 9001:2015".
    @Column({ type: 'varchar', length: 120 })
    title: string;

    // Categoría corta, ej: "Calidad", "Medio Ambiente".
    @Column({ type: 'varchar', length: 120 })
    subtitle: string;

    @Column({ type: 'text' })
    description: string;

    // La destacada se muestra en la banda aparte (hoy: ISO 39001).
    @Column({ type: 'boolean', default: false })
    isFeatured: boolean;

    // Key en el área pública del almacenamiento; opcional, hoy el sitio usa íconos genéricos.
    @Column({ type: 'varchar', length: 500, nullable: true })
    logoImage: string | null;

    // Key en el almacenamiento, del certificado en PDF descargable. Se expone
    // como URL absoluta directa: todo lo que guarda StorageService es público.
    @Column({ type: 'varchar', length: 500, nullable: true })
    certificatePdf: string | null;

    @Column({ type: 'int', default: 0 })
    sortOrder: number;
}
