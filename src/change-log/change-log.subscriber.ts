import { Injectable, Logger } from '@nestjs/common';
import {
    DataSource,
    EntityManager,
    EntitySubscriberInterface,
    InsertEvent,
    RecoverEvent,
    RemoveEvent,
    SoftRemoveEvent,
    UpdateEvent,
} from 'typeorm';
import { auditContext } from './audit-context';
import {
    ClaseEntidad,
    ENTIDADES_AUDITADAS,
    EntidadAuditada,
    ITEMS_COMO_DETALLE,
} from './audited-entities';
import { DetalleSuelto, diffDeCampos, diffDeItems } from './change-log.diff';
import {
    ActorKind,
    ChangeAction,
    ChangeLogEntry,
} from './entities/change-log-entry.entity';
import { ChangeLogDetail } from './entities/change-log-detail.entity';
import { SiteRevisionService } from './site-revision.service';
import { User } from '@/users/entities/user.entity';

/** Un asiento en preparación, esperando el commit. */
interface Pendiente {
    config: EntidadAuditada;
    entityId: string;
    entityLabel: string;
    action: ChangeAction;
    detalles: DetalleSuelto[];
}

/**
 * Registra en `change_log_entries` todo cambio sobre el contenido del sitio.
 *
 * Es un subscriber y no una llamada en cada servicio a propósito. La alternativa
 * eran ~36 llamadas repartidas por seis servicios, y este proyecto ya se comió
 * ese problema: una revisión encontró la misma regla escrita en `restore()` y
 * faltando en sus cinco `removePermanent()`. Acá sería peor, porque un asiento
 * que falta NO ROMPE NADA — nadie se entera hasta que el auditor pregunta.
 *
 * De yapa captura los ítems de servicio que TypeORM inserta y borra en cascada,
 * que por una llamada explícita se escaparían.
 *
 * REGLA CENTRAL: sin contexto de request no se registra nada. Con eso se
 * resuelven solos los tres casos molestos —las siembras del arranque, la
 * limpieza de tokens y cualquier tarea de fondo— sin código especial. Lo que sí
 * queda registrado es aprobar una importación de LinkedIn, porque eso llega por
 * un request con usuario.
 */
@Injectable()
export class ChangeLogSubscriber implements EntitySubscriberInterface {
    private readonly logger = new Logger(ChangeLogSubscriber.name);

    /** Asientos en preparación, por transacción. */
    private readonly pendientes = new Map<unknown, Pendiente[]>();

    /** Ítems de servicio capturados antes de que se borren. */
    private readonly itemsBorrados = new Map<
        unknown,
        { serviceId: string; label: string; sortOrder: number }[]
    >();

    constructor(
        dataSource: DataSource,
        private readonly revisiones: SiteRevisionService,
    ) {
        dataSource.subscribers.push(this);
    }

    // ── Eventos ──────────────────────────────────────────────────────────

    afterInsert(event: InsertEvent<object>): void {
        const config = this.configDe(event.entity);
        if (!config) {
            return;
        }
        this.encolar(event.queryRunner, {
            config,
            entityId: this.idDe(event.entity),
            entityLabel: config.label(event.entity as Record<string, unknown>),
            action: ChangeAction.CREACION,
            detalles: diffDeCampos(
                config,
                undefined,
                event.entity as Record<string, unknown>,
            ),
        });
    }

    afterUpdate(event: UpdateEvent<object>): void {
        if (!event.entity) {
            return;
        }
        const config = this.configDe(event.entity);
        if (!config) {
            return;
        }

        // Un repository.update() de query builder llega sin databaseEntity: se
        // sabe que algo cambió pero no qué. Se avisa para que el próximo caso
        // se delate en vez de perderse en silencio.
        if (!event.databaseEntity) {
            this.logger.warn(
                `Cambio en ${config.tipo} sin estado previo: vino de un update() ` +
                    'de query builder y no se puede registrar el detalle. ' +
                    'Convertilo a load + save().',
            );
            return;
        }

        const detalles = diffDeCampos(
            config,
            event.databaseEntity as unknown as Record<string, unknown>,
            event.entity,
        );
        if (!detalles.length) {
            return;
        }
        this.encolar(event.queryRunner, {
            config,
            entityId: this.idDe(event.entity),
            entityLabel: config.label(event.entity),
            action: ChangeAction.MODIFICACION,
            detalles,
        });
    }

    afterSoftRemove(event: SoftRemoveEvent<object>): void {
        this.registrarSinDetalle(event, ChangeAction.BAJA);
    }

    afterRecover(event: RecoverEvent<object>): void {
        this.registrarSinDetalle(event, ChangeAction.RESTAURACION);
    }

    /**
     * Los ítems de servicio se capturan ANTES de borrarse: una vez borrados, sus
     * valores viejos ya no están en ningún lado.
     */
    async beforeRemove(event: RemoveEvent<object>): Promise<void> {
        const entidad = event.entity ?? event.databaseEntity;
        if (!(entidad instanceof ITEMS_COMO_DETALLE) || !event.entityId) {
            return;
        }
        const filas = await event.manager.query<
            { label: string; sortOrder: number; serviceId: string }[]
        >(
            'SELECT label, "sortOrder", "serviceId" FROM service_items WHERE id = $1',
            [String(event.entityId)],
        );
        if (!filas.length) {
            return;
        }
        const lista = this.itemsBorrados.get(event.queryRunner) ?? [];
        lista.push(filas[0]);
        this.itemsBorrados.set(event.queryRunner, lista);
    }

    afterRemove(event: RemoveEvent<object>): void {
        const entidad = event.entity ?? event.databaseEntity;
        if (!entidad || entidad instanceof ITEMS_COMO_DETALLE) {
            return;
        }
        const config = this.configDe(entidad);
        if (!config) {
            return;
        }
        this.encolar(event.queryRunner, {
            config,
            entityId: String(event.entityId ?? this.idDe(entidad)),
            entityLabel: config.label(entidad as unknown as Record<string, unknown>),
            action: ChangeAction.ELIMINACION,
            detalles: [],
        });
    }

    /**
     * Se vuelca todo dentro de la MISMA transacción del cambio: si el registro
     * falla, el cambio se revierte.
     *
     * Es la propiedad que define un registro de auditoría. Un cambio que no
     * quedó registrado es peor que un cambio que no ocurrió, porque después no
     * hay forma de distinguir "no se tocó nada" de "se tocó y no se anotó".
     */
    async beforeTransactionCommit(event: {
        queryRunner: unknown;
        manager: EntityManager;
    }): Promise<void> {
        const pendientes = this.pendientes.get(event.queryRunner);
        this.pendientes.delete(event.queryRunner);
        this.itemsBorrados.delete(event.queryRunner);

        if (!pendientes?.length) {
            return;
        }

        const contexto = auditContext.actual();
        const usuario = contexto?.getUser();
        const revision = await this.revisiones.paraHoy(event.manager);
        const repo = event.manager.getRepository(ChangeLogEntry);
        const repoDetalle = event.manager.getRepository(ChangeLogDetail);

        for (const p of pendientes) {
            const asiento = await repo.save(
                repo.create({
                    revisionId: revision.id,
                    entityType: p.config.tipo,
                    entityId: p.entityId,
                    entityLabel: p.entityLabel.slice(0, 200),
                    action: p.action,
                    actorId: usuario?.id ?? null,
                    actorLabel: this.etiquetaDe(usuario),
                    actorKind: usuario ? ActorKind.USUARIO : ActorKind.SISTEMA,
                    requestId: contexto?.requestId ?? randomRequestId(),
                }),
            );
            if (p.detalles.length) {
                await repoDetalle.save(
                    p.detalles.map((d) =>
                        repoDetalle.create({ ...d, entryId: asiento.id }),
                    ),
                );
            }
        }
    }

    // ── Auxiliares ───────────────────────────────────────────────────────

    private registrarSinDetalle(
        event: SoftRemoveEvent<object> | RecoverEvent<object>,
        action: ChangeAction,
    ): void {
        const entidad = event.entity ?? event.databaseEntity;
        if (!entidad) {
            return;
        }
        const config = this.configDe(entidad);
        if (!config) {
            return;
        }
        this.encolar(event.queryRunner, {
            config,
            entityId: this.idDe(entidad),
            entityLabel: config.label(entidad as Record<string, unknown>),
            action,
            detalles: [],
        });
    }

    /** Devuelve la configuración si la entidad se audita, o null. */
    private configDe(entidad: unknown): EntidadAuditada | null {
        if (!entidad || typeof entidad !== 'object') {
            return null;
        }
        const contexto = auditContext.actual();
        // Sin contexto (siembras, tareas de fondo) o explícitamente omitido:
        // no se registra. Es la regla que resuelve los casos raros sin código
        // especial para cada uno.
        if (!contexto || contexto.omitido) {
            return null;
        }
        return (
            ENTIDADES_AUDITADAS.get(
                entidad.constructor as ClaseEntidad,
            ) ?? null
        );
    }

    private idDe(entidad: unknown): string {
        const id = (entidad as { id?: unknown } | undefined)?.id;
        return typeof id === 'string' ? id : '';
    }

    private etiquetaDe(usuario: User | undefined): string {
        if (!usuario) {
            return 'Sistema';
        }
        const nombre = [usuario.name, usuario.surname]
            .filter(Boolean)
            .join(' ');
        return (nombre ? `${nombre} <${usuario.email}>` : usuario.email).slice(
            0,
            280,
        );
    }

    private encolar(queryRunner: unknown, pendiente: Pendiente): void {
        const lista = this.pendientes.get(queryRunner) ?? [];
        lista.push(pendiente);
        this.pendientes.set(queryRunner, lista);
    }
}

/** Solo para el caso, hoy inalcanzable, de un flush sin contexto. */
function randomRequestId(): string {
    return '00000000-0000-4000-8000-000000000000';
}

// Se exporta para el spec; el diff de ítems se usa desde ServicesService.
export { diffDeItems };
