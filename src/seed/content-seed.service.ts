import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '@/services/entities/service.entity';
import { Certification } from '@/certifications/entities/certification.entity';
import {
    INITIAL_CERTIFICATIONS,
    INITIAL_SERVICES,
} from './data/initial-content';
import { auditContext } from '@/change-log/audit-context';

/**
 * Siembra el CONTENIDO EDITORIAL del sitio (servicios y certificaciones) la
 * primera vez que arranca la app, con los textos reales de Petrogas, para que
 * un despliegue nuevo no quede con el sitio en blanco.
 *
 * Clientes y novedades NO se siembran: no hay un contenido "de fábrica" para
 * ellos, se cargan desde el panel.
 *
 * Idempotente por tabla: solo actúa si la tabla está vacía, así nunca pisa lo
 * editado. El conteo incluye la papelera (withDeleted): si se borró todo el
 * contenido, "vacía" no debe significar "volver a sembrar".
 */
@Injectable()
export class ContentSeedService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ContentSeedService.name);

    constructor(
        @InjectRepository(Service)
        private readonly serviceRepository: Repository<Service>,
        @InjectRepository(Certification)
        private readonly certificationRepository: Repository<Certification>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            // Sin registro de cambios: el contenido sembrado NO es un cambio,
            // es la emisión inicial —la Rev. 00—. Registrarlo quemaría la
            // primera revisión con más de cien asientos de "sistema" cada vez
            // que alguien despliega en limpio o restaura un backup.
            await auditContext.sinRegistro(async () => {
                await this.seedServices();
                await this.seedCertifications();
            });
        } catch (err) {
            // El seed nunca debe impedir el arranque de la app.
            this.logger.error(
                'Fallo al sembrar el contenido inicial',
                err instanceof Error ? err.stack : String(err),
            );
        }
    }

    private async seedServices(): Promise<void> {
        if ((await this.serviceRepository.count({ withDeleted: true })) > 0) {
            return;
        }
        for (const seed of INITIAL_SERVICES) {
            const service = this.serviceRepository.create({
                ...seed,
                items: seed.items.map((item, index) => ({
                    ...item,
                    sortOrder: index,
                })),
            });
            await this.serviceRepository.save(service);
        }
        this.logger.log(
            `Servicios iniciales sembrados: ${INITIAL_SERVICES.length}`,
        );
    }

    private async seedCertifications(): Promise<void> {
        if (
            (await this.certificationRepository.count({
                withDeleted: true,
            })) > 0
        ) {
            return;
        }
        await this.certificationRepository.save(
            INITIAL_CERTIFICATIONS.map((c) =>
                this.certificationRepository.create(c),
            ),
        );
        this.logger.log(
            `Certificaciones iniciales sembradas: ${INITIAL_CERTIFICATIONS.length}`,
        );
    }
}
