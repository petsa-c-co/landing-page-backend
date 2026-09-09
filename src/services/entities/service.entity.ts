import { Column, Entity, Index, OneToMany } from 'typeorm';
import { SoftDeletableEntity } from '@/common/entities/soft-deletable.entity';
import { ServiceItemsLayout } from '../enum/service-items-layout.enum';
import { ServiceItem } from './service-item.entity';

@Entity('services')
export class Service extends SoftDeletableEntity {
    @Column({ type: 'varchar', length: 120 })
    title: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 140 })
    slug: string;

    // Para las cards del listado/index.
    @Column({ type: 'text' })
    shortDescription: string;

    // Para la página propia del servicio.
    @Column({ type: 'text' })
    longDescription: string;

    // Keys del área pública del almacenamiento; el service las expone como URLs absolutas.
    @Column({ type: 'varchar', length: 500, nullable: true })
    cardImage: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    bannerImage: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    detailImage: string | null;

    @Column({
        type: 'enum',
        enum: ServiceItemsLayout,
        default: ServiceItemsLayout.BULLETS,
    })
    itemsLayout: ServiceItemsLayout;

    @Column({ type: 'int', default: 0 })
    sortOrder: number;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    // cascade + orphanedRowAction: el update del panel reemplaza la lista
    // completa de items (los que no vienen en el save se borran).
    @OneToMany(() => ServiceItem, (item) => item.service, {
        cascade: true,
        orphanedRowAction: 'delete',
    })
    items: ServiceItem[];
}
