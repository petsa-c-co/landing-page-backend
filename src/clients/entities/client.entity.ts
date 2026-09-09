import { Column, Entity } from 'typeorm';
import { SoftDeletableEntity } from '@/common/entities/soft-deletable.entity';

// Cliente/empresa mostrado en "Algunos de nuestros clientes" (index).
@Entity('clients')
export class Client extends SoftDeletableEntity {
    @Column({ type: 'varchar', length: 120 })
    name: string;

    // Key del logo en el área pública del almacenamiento.
    @Column({ type: 'varchar', length: 500 })
    logoImage: string;

    @Column({ type: 'int', default: 0 })
    sortOrder: number;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;
}
