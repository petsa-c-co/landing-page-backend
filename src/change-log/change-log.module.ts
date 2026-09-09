import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteRevision } from './entities/site-revision.entity';
import { ChangeLogEntry } from './entities/change-log-entry.entity';
import { ChangeLogDetail } from './entities/change-log-detail.entity';
import { SiteRevisionService } from './site-revision.service';
import { ChangeLogSubscriber } from './change-log.subscriber';
import { ChangeLogService } from './change-log.service';
import { ChangeLogExportService } from './change-log-export.service';
import { ChangeLogController } from './change-log.controller';

/**
 * Registro de cambios del sitio: el control de documentos que pide la
 * certificación.
 *
 * No importa los módulos de contenido —solo sus entidades a través del
 * subscriber— así que no hay ciclos de dependencia. Mismo criterio que
 * MediaReferencesService.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([SiteRevision, ChangeLogEntry, ChangeLogDetail]),
    ],
    controllers: [ChangeLogController],
    providers: [
        SiteRevisionService,
        ChangeLogSubscriber,
        ChangeLogService,
        ChangeLogExportService,
    ],
    exports: [SiteRevisionService],
})
export class ChangeLogModule {}
