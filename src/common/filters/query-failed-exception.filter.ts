import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpStatus,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Request, Response } from 'express';

interface PostgresError extends Error {
    code?: string;
    detail?: string;
    column?: string;
    constraint?: string;
    table?: string;
}

const FIELD_TRANSLATIONS: Record<string, string> = {
    name: 'nombre',
    surname: 'apellido',
    email: 'correo electrónico',
    password: 'contraseña',
    roles: 'roles',
    isActive: 'activación',
};

@Catch(QueryFailedError)
export class QueryFailedExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        if (!(exception instanceof QueryFailedError)) {
            return;
        }
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const { message, statusCode } = this.parseError(
            exception as QueryFailedError,
        );

        response.status(statusCode).json({
            success: false,
            statusCode: statusCode,
            message: message,
            errors: null,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }

    private parseError(exception: QueryFailedError): {
        message: string;
        statusCode: HttpStatus;
    } {
        const pgError = exception.driverError as PostgresError;
        const errorCode = pgError?.code;

        switch (errorCode) {
            case '23505':
                return {
                    statusCode: HttpStatus.CONFLICT,
                    message: this.extractUniqueViolationMessage(pgError),
                };
            case '23503':
                return {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: 'La referencia especificada no existe',
                };
            case '23502':
                return {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: this.extractNotNullMessage(pgError),
                };
            case '22P02':
                return {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: this.extractEnumViolationMessage(exception),
                };
            case '23514':
                return {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: 'Los datos no cumplen con las restricciones',
                };
            case '22001':
                return {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message:
                        'Uno de los valores enviados excede la longitud máxima permitida',
                };
            case 'P0002':
                return {
                    statusCode: HttpStatus.NOT_FOUND,
                    message: 'El registro solicitado no fue encontrado',
                };
            case '42P01':
                return {
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    message: 'Error de configuración de base de datos',
                };
            case '08006':
                return {
                    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                    message: 'Servicio temporalmente no disponible',
                };
            default:
                return {
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    message: 'Error interno del servidor',
                };
        }
    }

    private extractUniqueViolationMessage(pgError: PostgresError): string {
        const detail = pgError?.detail ?? '';
        // Se identifica el campo en conflicto pero NUNCA se refleja el valor
        // enviado (podría ser un dato personal o un intento de inyección).
        const match = /Key \(([^)]+)\)=/.exec(detail);
        if (match) {
            const [, field] = match;
            const translatedField = FIELD_TRANSLATIONS[field] || field;
            return `Ya existe un registro con este valor de ${translatedField}`;
        }
        return 'Ya existe un registro con estos datos';
    }

    private extractNotNullMessage(pgError: PostgresError): string {
        return pgError?.column
            ? `El campo ${pgError.column} es obligatorio`
            : 'Faltan campos obligatorios';
    }

    private extractEnumViolationMessage(exception: QueryFailedError): string {
        const enumMatch = /invalid input value for enum (\w+): "([^"]*)"/i.exec(
            exception.message,
        );
        if (enumMatch) {
            const [, enumName, invalidValue] = enumMatch;
            const fieldMatch = /(\w+)_enum$/.exec(enumName);
            const fieldName = fieldMatch ? fieldMatch[1] : 'campo';
            return `El valor "${invalidValue}" no es válido para el campo ${fieldName}`;
        }
        return 'Valor no válido para el campo especificado';
    }
}
