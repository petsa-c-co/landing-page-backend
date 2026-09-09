import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DegreeTitle } from '@/recruitment/entities/degree-title.entity';
import {
    INITIAL_DEGREE_TITLES,
    } from './data/initial-catalogs';
import { auditContext } from '@/change-log/audit-context';

/**
 * Siembra el catálogo de TÍTULOS educativos del formulario público de RRHH la
 * primera vez que arranca la app: sin él, el autocompletado del formulario
 * queda vacío.
 *
 * Los puestos ya no se siembran: desde que las postulaciones pasaron a Gestión
 * Petrogas, el catálogo de puestos es de ellos y este backend solo lo reenvía.
 *
 * El contenido EDITORIAL del sitio (servicios, certificaciones, clientes,
 * novedades) NO se siembra: arranca vacío y se carga desde el panel.
 *
 * Idempotente por tabla: solo actúa si la tabla está vacía, así nunca pisa lo
 * editado. El conteo incluye la papelera (withDeleted): si se borró todo el
 * catálogo, "vacía" no debe significar "volver a sembrar".
 */
@Injectable()
export class CatalogSeedService implements OnApplicationBootstrap {
    private readonly logger = new Logger(CatalogSeedService.name);

    constructor(
        @InjectRepository(DegreeTitle)
        private readonly degreeTitleRepository: Repository<DegreeTitle>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            // Sin registro de cambios: el contenido sembrado NO es un cambio,
            // es la emisión inicial —la Rev. 00—. Registrarlo quemaría la
            // primera revisión con más de cien asientos de "sistema" cada vez
            // que alguien despliega en limpio o restaura un backup.
            await auditContext.sinRegistro(async () => {
                await this.seedDegreeTitles();
            });
        } catch (err) {
            // El seed nunca debe impedir el arranque de la app.
            this.logger.error(
                'Fallo al sembrar los catálogos de RRHH',
                err instanceof Error ? err.stack : String(err),
            );
        }
    }


    private async seedDegreeTitles(): Promise<void> {
        if (
            (await this.degreeTitleRepository.count({ withDeleted: true })) > 0
        ) {
            return;
        }
        await this.degreeTitleRepository.save(
            INITIAL_DEGREE_TITLES.map((title, index) =>
                this.degreeTitleRepository.create({
                    ...title,
                    sortOrder: index,
                }),
            ),
        );
        this.logger.log(
            `Títulos iniciales sembrados: ${INITIAL_DEGREE_TITLES.length}`,
        );
    }
}
