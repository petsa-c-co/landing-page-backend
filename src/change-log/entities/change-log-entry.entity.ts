import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { SiteRevision } from './site-revision.entity';
import { ChangeLogDetail } from './change-log-detail.entity';

/** Qué se le hizo al registro. */
export enum ChangeAction {
    CREACION = 'creacion',
    MODIFICACION = 'modificacion',
    BAJA = 'baja',
    RESTAURACION = 'restauracion',
    ELIMINACION = 'eliminacion',
}

/** Quién lo hizo: una persona con sesión, o el propio sistema. */
export enum ActorKind {
    USUARIO = 'usuario',
    SISTEMA = 'sistema',
}

/**
 * Un asiento del registro de cambios: qué se tocó, quién y cuándo.
 *
 * Es APPEND-ONLY. No hay endpoint que lo edite ni que lo borre, a propósito: un
 * registro que se puede modificar no sirve como registro.
 *
 * Lo importante del diseño está en los campos DESNORMALIZADOS. Un rastro de
 * auditoría tiene que seguir siendo legible cuando lo que describe ya no
 * existe: si se elimina definitivamente una certificación, o se borra la cuenta
 * de quien la editó, el asiento tiene que seguir diciendo qué era y quién fue.
 * Por eso `entityLabel` y `actorLabel` guardan el texto del momento, y por eso
 * esta tabla NO tiene claves foráneas hacia las tablas de contenido.
 */
@Entity('change_log_entries')
@Index(['occurredAt'])
@Index(['entityType', 'entityId'])
export class ChangeLogEntry {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Con zona: el día decide la revisión (ver argentina-day.util.ts).
    @Column({ type: 'timestamptz', default: () => 'now()' })
    occurredAt: Date;

    @ManyToOne(() => SiteRevision, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'revisionId' })
    revision: SiteRevision;

    @Column({ type: 'uuid' })
    revisionId: string;

    /**
     * Qué tipo de contenido se tocó: `servicio`, `certificacion`, `cliente`…
     *
     * varchar y no enum de Postgres, con el mismo criterio que `users.roles`:
     * sumar un tipo nuevo no debería exigir una migración.
     */
    @Column({ type: 'varchar', length: 40 })
    entityType: string;

    @Column({ type: 'uuid' })
    entityId: string;

    /**
     * Cómo se llamaba el registro CUANDO se lo tocó.
     *
     * Congelado a propósito. Si mañana se renombra o se elimina, el asiento
     * sigue diciendo de qué se trataba — y tras un borrado definitivo es el
     * único rastro que queda.
     */
    @Column({ type: 'varchar', length: 200 })
    entityLabel: string;

    @Column({ type: 'enum', enum: ChangeAction })
    action: ChangeAction;

    /**
     * Referencia blanda al usuario. `ON DELETE SET NULL` y no CASCADE: borrar
     * una cuenta no puede borrar el rastro de lo que esa cuenta hizo.
     */
    @Column({ type: 'uuid', nullable: true })
    actorId: string | null;

    /** "Nombre Apellido <mail>" del momento. Sobrevive al borrado del usuario. */
    @Column({ type: 'varchar', length: 280 })
    actorLabel: string;

    @Column({ type: 'enum', enum: ActorKind, default: ActorKind.USUARIO })
    actorKind: ActorKind;

    /** Agrupa todo lo que cambió en un mismo request. */
    @Column({ type: 'uuid' })
    requestId: string;

    @OneToMany(() => ChangeLogDetail, (detalle) => detalle.entry, {
        cascade: ['insert'],
    })
    details: ChangeLogDetail[];
}
