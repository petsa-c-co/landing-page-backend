import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DegreeTitle } from './entities/degree-title.entity';
import { DegreeTitlesService } from './services/degree-titles.service';
import { DegreeTitlesController } from './controllers/degree-titles.controller';
import { JobProfilesController } from './controllers/job-profiles.controller';
import { ApplicationsController } from './controllers/applications.controller';
import { GestionClient } from './gestion/gestion.client';

/**
 * Sección "Trabajá con nosotros".
 *
 * Las POSTULACIONES y los PUESTOS son de Gestión Petrogas: acá no se guarda
 * nada de eso —ni los datos ni los CVs— y los dos endpoints funcionan como
 * puente, poniendo el token que el navegador no puede ver. Las rutas se
 * mantuvieron iguales para que el frontend no tuviera que cambiar.
 *
 * Los TÍTULOS académicos sí siguen siendo nuestros: alimentan el
 * autocompletado del formulario y RRHH los administra desde el panel. Gestión
 * pidió recibir `degreeTitleId` + `degreeTitleName` justamente porque el
 * catálogo lo mantenemos de este lado.
 */
@Module({
    imports: [TypeOrmModule.forFeature([DegreeTitle])],
    controllers: [
        DegreeTitlesController,
        JobProfilesController,
        ApplicationsController,
    ],
    providers: [DegreeTitlesService, GestionClient],
    exports: [DegreeTitlesService],
})
export class RecruitmentModule {}
