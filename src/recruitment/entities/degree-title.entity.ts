import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity } from '@/common/entities/soft-deletable.entity';
import { DegreeTitleLevel } from '../enum/degree-title-level.enum';

/**
 * Catálogo de títulos educativos (snapshot propio, no se consume ninguna API
 * externa en runtime). Alimenta el autocompletado del formulario público y
 * permite filtrar postulaciones por título sin ambigüedades de tipeo.
 * Se administra desde el panel: cuando aparece un título nuevo escrito a mano
 * (campo "Otro" del formulario), RRHH puede darlo de alta acá.
 */
@Entity('degree_titles')
export class DegreeTitle extends SoftDeletableEntity {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 150 })
    name: string;

    @Index()
    @Column({ type: 'enum', enum: DegreeTitleLevel })
    level: DegreeTitleLevel;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @Column({ type: 'int', default: 0 })
    sortOrder: number;
}
