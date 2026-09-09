import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ExceptionResponse {
    message?: string | string[];
    // Los errores de validación propios (ValidationPipe) llegan como lista.
    // Los 422 que reenvía GestionClient llegan como mapa campo -> mensajes, y
    // así viajan al frontend: declarar solo string[] hacía que el tipo dejara
    // de servir como red justo donde hay dos formas.
    errors?: string[] | Record<string, string[]>;
    // Dato estructurado opcional de los 409 por valor único ya tomado: indica
    // QUÉ registro lo retiene, para que el panel ofrezca la solución
    // (restaurarlo / eliminarlo definitivamente). Ver unique-conflict.util.ts.
    conflict?: unknown;
}

// Mensajes de 413 que vienen de las librerías, siempre en inglés. Cualquier
// otro texto es nuestro y describe mejor el caso, así que se prefiere.
const MENSAJES_413_DE_LIBRERIA = ['File too large', 'request entity too large'];

function mensajePropio(respuesta: string | ExceptionResponse): string | null {
    const texto =
        typeof respuesta === 'string' ? respuesta : respuesta?.message;
    if (typeof texto !== 'string' || !texto.trim()) {
        return null;
    }
    return MENSAJES_413_DE_LIBRERIA.includes(texto) ? null : texto;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Error interno del servidor';
        let errors: string[] | Record<string, string[]> | null = null;
        let conflict: unknown = null;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse =
                exception.getResponse() as ExceptionResponse;

            // Multer y body-parser lanzan el 413 con mensaje en inglés ("File
            // too large", "request entity too large"); se traduce acá para
            // mantener la API en español.
            //
            // Los endpoints de subida mandan su propio mensaje, que además dice
            // el límite concreto (ver SingleFileUpload). Ese tiene prioridad:
            // "supera el tamaño máximo de 5 MB" le sirve mucho más a quien sube
            // el archivo que un genérico.
            if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
                response.status(status).json({
                    success: false,
                    statusCode: status,
                    message:
                        mensajePropio(exceptionResponse) ??
                        'El archivo o la petición exceden el tamaño máximo permitido',
                    errors: null,
                    timestamp: new Date().toISOString(),
                    path: request.url,
                });
                return;
            }

            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            } else if (typeof exceptionResponse === 'object') {
                if (exceptionResponse.message) {
                    if (Array.isArray(exceptionResponse.message)) {
                        message = exceptionResponse.message[0];
                        errors = exceptionResponse.message;
                    } else {
                        message = exceptionResponse.message;
                    }
                }
                if (exceptionResponse.errors) {
                    errors = exceptionResponse.errors;
                }
                if (exceptionResponse.conflict) {
                    conflict = exceptionResponse.conflict;
                }
            }
        }

        response.status(status).json({
            success: false,
            statusCode: status,
            message: message,
            errors: errors,
            // Solo presente en los 409 por valor único; el resto de los errores
            // conserva el cuerpo de siempre.
            ...(conflict ? { conflict } : {}),
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}
