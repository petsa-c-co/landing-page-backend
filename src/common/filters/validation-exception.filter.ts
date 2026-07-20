import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ExceptionResponse {
    message?: string | string[];
    errors?: string[];
}

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
    catch(exception: BadRequestException, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const status = exception.getStatus();
        const exceptionResponse = exception.getResponse() as ExceptionResponse;

        let message = 'Error de validación';
        let errors: string[] = [];

        if (typeof exceptionResponse === 'object') {
            if (
                exceptionResponse.errors &&
                Array.isArray(exceptionResponse.errors)
            ) {
                errors = exceptionResponse.errors;
                message =
                    (exceptionResponse.message as string) ||
                    'Error de validación';
            } else if (
                exceptionResponse.message &&
                Array.isArray(exceptionResponse.message)
            ) {
                errors = exceptionResponse.message;
                message = errors[0];
            } else if (exceptionResponse.message) {
                message = exceptionResponse.message;
                errors = [message];
            }
        } else {
            message = exception.message;
            errors = [message];
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
