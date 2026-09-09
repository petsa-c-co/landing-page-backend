import { Controller, Get } from '@nestjs/common';
import { GestionClient, JobPosition } from '../gestion/gestion.client';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

/**
 * Puestos para el formulario "Trabajá con nosotros".
 *
 * La ruta es la misma de siempre para que el frontend no cambie, pero el
 * catálogo ya NO es nuestro: lo publica Gestión Petrogas, que es donde RRHH
 * los administra. Acá solo se reenvía la consulta poniendo el token, que no
 * puede viajar al navegador.
 *
 * Ojo con los `id`: los de Gestión son NUMÉRICOS (los nuestros eran UUID).
 */
@Controller('recruitment/job-profiles')
export class JobProfilesController {
    constructor(private readonly gestion: GestionClient) {}

    @Get()
    @ResponseMessage('Puestos obtenidos correctamente')
    findAll(): Promise<JobPosition[]> {
        return this.gestion.fetchJobPositions();
    }
}
