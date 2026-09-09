import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { ChangeLogEntry } from './change-log-entry.entity';

/** Cómo se muestra el valor en el Excel y en el panel. */
export enum ValueKind {
    TEXTO = 'texto',
    BOOLEANO = 'booleano',
    NUMERO = 'numero',
    FECHA = 'fecha',
    ARCHIVO = 'archivo',
    LISTA = 'lista',
}

/**
 * Un campo que cambió dentro de un asiento.
 *
 * Tabla hija y no una columna jsonb: el Excel quiere una fila por campo, el
 * auditor va a preguntar "todos los cambios sobre el alcance de la
 * certificación" —que así es una consulta indexable— y el proyecto hoy no usa
 * jsonb en ningún lado.
 *
 * `previousValue` y `newValue` quedan en null cuando el campo es LARGO (el
 * cuerpo de una nota, una descripción extensa): ahí solo se registra QUE
 * cambió, con el texto de `summary`. Guardar 100.000 caracteres por edición
 * inflaría el registro y volvería el Excel inmanejable.
 */
@Entity('change_log_details')
@Index(['entryId'])
export class ChangeLogDetail {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => ChangeLogEntry, (entry) => entry.details, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'entryId' })
    entry: ChangeLogEntry;

    @Column({ type: 'uuid' })
    entryId: string;

    /** Nombre del campo en el código, para poder filtrar. */
    @Column({ type: 'varchar', length: 60 })
    field: string;

    /** Cómo se llama en castellano, para el panel y el Excel. */
    @Column({ type: 'varchar', length: 80 })
    fieldLabel: string;

    @Column({ type: 'text', nullable: true })
    previousValue: string | null;

    @Column({ type: 'text', nullable: true })
    newValue: string | null;

    /**
     * Descripción cuando no se guardan los valores: "se modificó el cuerpo",
     * "se reemplazó el logo". Null cuando el antes y el después alcanzan.
     */
    @Column({ type: 'varchar', length: 200, nullable: true })
    summary: string | null;

    @Column({ type: 'enum', enum: ValueKind, default: ValueKind.TEXTO })
    valueKind: ValueKind;
}
