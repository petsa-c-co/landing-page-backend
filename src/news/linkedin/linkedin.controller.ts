import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
} from '@nestjs/common';
import { LinkedInImportService } from './linkedin.service';
import { LinkedInImport } from '../entities/linkedin-import.entity';
import { NewsPost } from '../entities/news-post.entity';
import { ApproveLinkedInImportDto } from '../dto/approve-linkedin-import.dto';
import { LinkedInQueueQueryDto } from '../dto/linkedin-queue-query.dto';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

/**
 * Curaduría de novedades importadas desde LinkedIn. Todo el controlador es
 * admin/rrhh: son acciones de gestión, no contenido público (lo público sale
 * de /news, que lee news_posts).
 */
@Controller('news/linkedin')
@Auth(UserRoles.ADMIN, UserRoles.RRHH)
export class LinkedInController {
    constructor(private readonly linkedInService: LinkedInImportService) {}

    // Dispara una sincronización con LinkedIn: trae posteos y agrega los nuevos
    // a la cola. Con LINKEDIN_FETCH_MODE=stub funciona sin credenciales reales.
    @Post('sync')
    @ResponseMessage('Sincronización con LinkedIn completada')
    sync(): Promise<{ fetched: number; created: number }> {
        return this.linkedInService.sync();
    }

    // Cola de curaduría (por defecto, pendientes de aprobación).
    @Get('imports')
    @ResponseMessage('Importaciones obtenidas correctamente')
    findQueue(
        @Query() query: LinkedInQueueQueryDto,
    ): Promise<PaginatedResult<LinkedInImport>> {
        return this.linkedInService.findQueue(query);
    }

    // Aprueba y publica el posteo como nota; requiere categoría.
    @Post('imports/:id/approve')
    @ResponseMessage('Publicación aprobada y publicada')
    approve(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Body() dto: ApproveLinkedInImportDto,
    ): Promise<NewsPost> {
        return this.linkedInService.approve(id, dto);
    }

    // Rechaza el posteo: no se publica y no vuelve a aparecer en la cola.
    @Post('imports/:id/reject')
    @ResponseMessage('Publicación rechazada')
    reject(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<LinkedInImport> {
        return this.linkedInService.reject(id);
    }
}
