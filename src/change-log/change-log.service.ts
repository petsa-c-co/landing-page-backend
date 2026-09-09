import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ChangeLogEntry } from './entities/change-log-entry.entity';
import { ChangeLogQueryDto } from './dto/change-log-query.dto';
import { paginate } from '@/common/utils/pagination.util';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';
import { formatRevisionNumber } from './utils/revision-number.util';

/**
 * Tope de filas de una exportación.
 *
 * El Excel se arma entero en memoria antes de mandarse, así que un rango
 * enorme podría tumbar el proceso. Se rechaza con un mensaje que dice qué
 * hacer, en vez de morir sin explicación.
 */
const MAX_FILAS_EXPORT = 50_000;

/** Un asiento tal como lo consume el panel y el Excel. */
export interface AsientoDeCambio {
    id: string;
    occurredAt: Date;
    revision: string;
    entityType: string;
    entityLabel: string;
    action: string;
    actorLabel: string;
    details: {
        fieldLabel: string;
        previousValue: string | null;
        newValue: string | null;
        summary: string | null;
        valueKind: string;
    }[];
}

@Injectable()
export class ChangeLogService {
    constructor(
        @InjectRepository(ChangeLogEntry)
        private readonly entryRepository: Repository<ChangeLogEntry>,
    ) {}

    async findAll(
        query: ChangeLogQueryDto,
    ): Promise<PaginatedResult<AsientoDeCambio>> {
        const qb = this.filtrado(query);
        const [items, total] = await qb
            .orderBy('entry.occurredAt', 'DESC')
            .skip(((query.page ?? 1) - 1) * (query.limit ?? 20))
            .take(query.limit ?? 20)
            .getManyAndCount();

        return paginate(items.map(toAsiento), total, {
            page: query.page,
            limit: query.limit,
        });
    }

    /** Todo lo que entra en el rango, sin paginar, para el Excel. */
    async findForExport(query: ChangeLogQueryDto): Promise<AsientoDeCambio[]> {
        const qb = this.filtrado(query);
        const total = await qb.getCount();

        if (total > MAX_FILAS_EXPORT) {
            throw new BadRequestException(
                `El rango seleccionado tiene ${total.toLocaleString('es-AR')} cambios, ` +
                    `más de los ${MAX_FILAS_EXPORT.toLocaleString('es-AR')} que se pueden exportar de una vez. ` +
                    'Acotá el rango de fechas.',
            );
        }

        const items = await qb.orderBy('entry.occurredAt', 'DESC').getMany();
        return items.map(toAsiento);
    }

    private filtrado(
        query: ChangeLogQueryDto,
    ): SelectQueryBuilder<ChangeLogEntry> {
        const qb = this.entryRepository
            .createQueryBuilder('entry')
            .leftJoinAndSelect('entry.details', 'detail')
            .leftJoinAndSelect('entry.revision', 'revision');

        if (query.from) {
            qb.andWhere('entry."occurredAt" >= :from', { from: query.from });
        }
        if (query.to) {
            // Inclusive: el día "hasta" entra entero.
            qb.andWhere('entry."occurredAt" < (:to::date + 1)', {
                to: query.to,
            });
        }
        if (query.entityType) {
            qb.andWhere('entry."entityType" = :entityType', {
                entityType: query.entityType,
            });
        }
        if (query.action) {
            qb.andWhere('entry.action = :action', { action: query.action });
        }
        return qb;
    }
}

function toAsiento(entry: ChangeLogEntry): AsientoDeCambio {
    return {
        id: entry.id,
        occurredAt: entry.occurredAt,
        revision: entry.revision
            ? formatRevisionNumber(entry.revision.number)
            : '—',
        entityType: entry.entityType,
        entityLabel: entry.entityLabel,
        action: entry.action,
        actorLabel: entry.actorLabel,
        details: (entry.details ?? []).map((d) => ({
            fieldLabel: d.fieldLabel,
            previousValue: d.previousValue,
            newValue: d.newValue,
            summary: d.summary,
            valueKind: d.valueKind,
        })),
    };
}
