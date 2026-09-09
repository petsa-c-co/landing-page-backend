import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SiteRevision } from './entities/site-revision.entity';
import { argentinaDay } from './utils/argentina-day.util';
import {
    REVISION_BASE,
    formatRevisionNumber,
} from './utils/revision-number.util';

/**
 * Clave del advisory lock de Postgres que serializa el alta de una revisión.
 *
 * Es un número arbitrario pero FIJO: dos procesos que usen el mismo número se
 * excluyen mutuamente. Se toma solo en el primer cambio de cada día y se libera
 * solo al terminar la transacción.
 */
const LOCK_REVISION = 8_142_026;

export interface RevisionActual {
    /** "03", o "00" si el sitio todavía está en su línea de base. */
    revision: string;
    /** Día de la última revisión, `YYYY-MM-DD`. Null si no hubo ninguna. */
    revisionDate: string | null;
}

@Injectable()
export class SiteRevisionService {
    constructor(
        @InjectRepository(SiteRevision)
        private readonly revisionRepository: Repository<SiteRevision>,
    ) {}

    /** Lo que muestra el footer. */
    async actual(): Promise<RevisionActual> {
        const ultima = await this.revisionRepository.findOne({
            where: {},
            order: { number: 'DESC' },
        });

        return ultima
            ? {
                  revision: formatRevisionNumber(ultima.number),
                  revisionDate: ultima.day,
              }
            : { revision: REVISION_BASE, revisionDate: null };
    }

    /**
     * Devuelve la revisión del día, creándola si es el primer cambio.
     *
     * Corre DENTRO de la transacción del cambio que la motivó (por eso recibe
     * el manager): si ese cambio termina revirtiéndose, la revisión no queda
     * creada de gusto.
     *
     * El camino rápido —la revisión ya existe— es el 99% de las veces y no toma
     * ningún candado. Solo el primer cambio de cada día paga el advisory lock,
     * que es lo que evita que dos requests simultáneos calculen el mismo número
     * para días distintos y choquen contra el índice único.
     */
    async paraHoy(
        manager: EntityManager,
        instante: Date = new Date(),
    ): Promise<SiteRevision> {
        const day = argentinaDay(instante);
        const repo = manager.getRepository(SiteRevision);

        const existente = await repo.findOne({ where: { day } });
        if (existente) {
            return existente;
        }

        // Se libera solo al COMMIT o al ROLLBACK; no hay que soltarlo a mano.
        await manager.query('SELECT pg_advisory_xact_lock($1)', [
            LOCK_REVISION,
        ]);

        // Otro request pudo haberla creado mientras se esperaba el candado.
        const reintento = await repo.findOne({ where: { day } });
        if (reintento) {
            return reintento;
        }

        const fila = await repo
            .createQueryBuilder('r')
            .select('COALESCE(MAX(r.number), 0)', 'max')
            .getRawOne<{ max: string }>();

        return repo.save(
            repo.create({ day, number: Number(fila?.max ?? 0) + 1 }),
        );
    }
}
