import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import { IGNORE_RESPONSE_INTERCEPTOR_KEY } from '../decorators/ignore-response-interceptor.decorator';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { PaginationMeta } from '../interfaces/paginated-result.interface';
import { buildPageUrl } from '../utils/pagination.util';

// Sobre de respuesta estándar para respuestas exitosas (2xx).
// Los errores los formatean los Exception Filters (incluyen timestamp/path).
export interface ApiResponse<T> {
    success: true;
    statusCode: number;
    message: string;
    data: T | null;
    meta?: PaginationMeta;
}

const DEFAULT_MESSAGE = 'Operación exitosa';

// Forma (duck-typed) de un resultado paginado. Se comprueba por estructura y no
// con instanceof, porque ClassSerializerInterceptor ya lo convirtió a objeto
// plano cuando este interceptor lo recibe.
interface PaginatedShape {
    data: unknown[];
    meta: PaginationMeta;
}

function isPaginated(value: unknown): value is PaginatedShape {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    const meta = candidate.meta as Record<string, unknown> | undefined;
    return (
        Array.isArray(candidate.data) &&
        typeof meta === 'object' &&
        meta !== null &&
        typeof meta.currentPage === 'number'
    );
}

@Injectable()
export class ResponseInterceptor<T>
    implements NestInterceptor<T, ApiResponse<T> | T>
{
    constructor(private readonly reflector: Reflector) {}

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<ApiResponse<T> | T> {
        const ignore = this.reflector.getAllAndOverride<boolean>(
            IGNORE_RESPONSE_INTERCEPTOR_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (ignore) {
            return next.handle() as Observable<T>;
        }

        const message =
            this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) ?? DEFAULT_MESSAGE;

        return next.handle().pipe(
            map((payload: unknown): ApiResponse<T> => {
                const ctx = context.switchToHttp();
                const statusCode = ctx.getResponse<Response>().statusCode;

                if (isPaginated(payload)) {
                    const request = ctx.getRequest<Request>();
                    const meta = this.withPageUrls(payload.meta, request);
                    return {
                        success: true,
                        statusCode,
                        message,
                        data: payload.data as T,
                        meta,
                    };
                }

                return {
                    success: true,
                    statusCode,
                    message,
                    data: (payload ?? null) as T | null,
                };
            }),
        );
    }

    private withPageUrls(
        meta: PaginationMeta,
        request: Request,
    ): PaginationMeta {
        const query = request.query as Record<string, unknown>;
        return {
            ...meta,
            nextPageUrl: meta.hasNextPage
                ? buildPageUrl(request.path, query, meta.currentPage + 1)
                : null,
            prevPageUrl: meta.hasPrevPage
                ? buildPageUrl(request.path, query, meta.currentPage - 1)
                : null,
        };
    }
}
