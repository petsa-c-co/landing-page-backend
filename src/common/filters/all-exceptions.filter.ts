import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Filtro de última línea: garantiza el sobre estándar de error para cualquier
 * excepción que no capturen los filtros específicos (errores de programación,
 * JSON malformado rechazado por body-parser, etc.). Las HttpException nunca
 * llegan aquí: las captura HttpExceptionFilter, que se evalúa antes.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        // Los errores de la capa HTTP de Express (p. ej. JSON malformado)
        // traen un status 4xx propio y son culpa del cliente; cualquier otra
        // cosa es un 500 cuyos detalles no se exponen.
        const candidate = exception as {
            status?: unknown;
            statusCode?: unknown;
        };
        const rawStatus =
            typeof candidate?.status === 'number'
                ? candidate.status
                : typeof candidate?.statusCode === 'number'
                  ? candidate.statusCode
                  : HttpStatus.INTERNAL_SERVER_ERROR;
        const isClientError = rawStatus >= 400 && rawStatus < 500;
        const status = isClientError
            ? rawStatus
            : HttpStatus.INTERNAL_SERVER_ERROR;

        if (!isClientError) {
            this.logger.error(
                exception instanceof Error
                    ? (exception.stack ?? exception.message)
                    : String(exception),
            );
        }

        response.status(status).json({
            success: false,
            statusCode: status,
            message: isClientError
                ? 'La petición no es válida o está mal formada'
                : 'Error interno del servidor',
            errors: null,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}
