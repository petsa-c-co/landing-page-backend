import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AsientoDeCambio, ChangeLogService } from './change-log.service';
import { ChangeLogExportService } from './change-log-export.service';
import { ChangeLogQueryDto } from './dto/change-log-query.dto';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { IgnoreResponseInterceptor } from '@/common/decorators/ignore-response-interceptor.decorator';
import { attachmentDisposition } from '@/common/utils/content-disposition.util';
import { argentinaDay } from './utils/argentina-day.util';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';

/**
 * Registro de cambios del sitio.
 *
 * Solo lectura, y a propósito: no hay endpoint que edite ni borre un asiento.
 * Un registro que se puede modificar no sirve como registro.
 *
 * Lo ven el admin y el auditor, que son los dos roles que responden por la
 * certificación.
 */
@Controller('change-log')
@Auth(UserRoles.ADMIN, UserRoles.AUDITOR)
export class ChangeLogController {
    constructor(
        private readonly changeLog: ChangeLogService,
        private readonly exportador: ChangeLogExportService,
    ) {}

    @Get()
    @ResponseMessage('Registro de cambios obtenido correctamente')
    findAll(
        @Query() query: ChangeLogQueryDto,
    ): Promise<PaginatedResult<AsientoDeCambio>> {
        return this.changeLog.findAll(query);
    }

    /**
     * Descarga la planilla.
     *
     * Va con `@Res()` sin passthrough y `@IgnoreResponseInterceptor()`: si el
     * handler devolviera el Buffer, ClassSerializerInterceptor lo convertiría
     * en `{type:'Buffer', data:[…]}` y ResponseInterceptor lo envolvería en el
     * sobre JSON — el archivo llegaría roto. Y el nombre lleva la fecha, así
     * que no se puede armar con `@Header()`, que es estático.
     */
    @Get('export')
    @IgnoreResponseInterceptor()
    async export(
        @Query() query: ChangeLogQueryDto,
        @Res() res: Response,
    ): Promise<void> {
        const asientos = await this.changeLog.findForExport(query);
        const buffer = await this.exportador.build(asientos);

        const nombre =
            query.from && query.to
                ? `registro-de-cambios-${query.from}_${query.to}.xlsx`
                : `registro-de-cambios-${argentinaDay()}.xlsx`;

        // Los headers se tocan recién acá: si algo de arriba tira, el filtro de
        // excepciones todavía puede responder un JSON como corresponde.
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', attachmentDisposition(nombre));
        res.setHeader('Content-Length', String(buffer.length));
        res.end(buffer);
    }
}
