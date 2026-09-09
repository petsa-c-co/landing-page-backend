import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from '@/services/entities/service.entity';
import { ServiceItem } from '@/services/entities/service-item.entity';
import { Certification } from '@/certifications/entities/certification.entity';
import { DegreeTitle } from '@/recruitment/entities/degree-title.entity';
import { ContentSeedService } from './content-seed.service';
import { CatalogSeedService } from './catalog-seed.service';

/**
 * Seed del primer arranque, para que un despliegue nuevo no quede en blanco:
 *
 *  - ContentSeedService: contenido editorial del sitio (servicios y
 *    certificaciones) con los textos reales de Petrogas.
 *  - CatalogSeedService: títulos académicos, que alimentan el autocompletado
 *    del formulario público. Los PUESTOS ya no se siembran: los publica
 *    Gestión Petrogas.
 *
 * Ambos son idempotentes: siembran solo si la tabla está vacía —contando
 * también la papelera— así que nunca pisan lo editado desde el panel ni
 * resucitan algo que se borró a propósito.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            Service,
            ServiceItem,
            Certification,
            DegreeTitle,
        ]),
    ],
    providers: [ContentSeedService, CatalogSeedService],
})
export class SeedModule {}
