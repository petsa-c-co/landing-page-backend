import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Service } from './service.entity';

// Item de la lista de un servicio. Una sola forma cubre los 3 layouts reales:
// bullets usa solo label; icons agrega icon; numbered agrega spec.
@Entity('service_items')
export class ServiceItem extends BaseEntity {
    @Column({ type: 'varchar', length: 200 })
    label: string;

    // Dato técnico del item (ej: "1440 ASME" en Well Testing).
    @Column({ type: 'varchar', length: 200, nullable: true })
    spec: string | null;

    // Identificador de ícono que resuelve el frontend (ej: 'pickup', 'combi').
    @Column({ type: 'varchar', length: 50, nullable: true })
    icon: string | null;

    @Column({ type: 'int', default: 0 })
    sortOrder: number;

    @Index()
    @ManyToOne(() => Service, (service) => service.items, {
        onDelete: 'CASCADE',
    })
    service: Service;
}
