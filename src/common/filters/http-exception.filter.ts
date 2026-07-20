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
    errors?: string[];
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Error interno del servidor';
        let errors: string[] | null = null;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse =
                exception.getResponse() as ExceptionResponse;

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
            }
        }

        response.status(status).json({
            success: false,
            statusCode: status,
            message: message,
            errors: errors,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}
