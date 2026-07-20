import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Get,
    INestApplication,
    Module,
    Post,
    ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IsNotEmpty, IsString } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpExceptionFilter } from './http-exception.filter';
import { QueryFailedExceptionFilter } from './query-failed-exception.filter';
import { ValidationExceptionFilter } from './validation-exception.filter';
import { ResponseInterceptor } from '../interceptors/response.interceptor';

/**
 * Verifica que TODA respuesta (éxito y error, incluidos errores no-HTTP y
 * JSON malformado) respete el sobre estándar, con la MISMA configuración de
 * providers globales que usa AppModule. Si el orden de evaluación de los
 * filtros cambiara, estos tests fallan.
 */

class EchoDto {
    @IsNotEmpty()
    @IsString()
    value: string;
}

// Forma del sobre de error, para tipar las aserciones sobre res.body.
interface ErrorEnvelope {
    success: boolean;
    statusCode: number;
    message: string;
    errors: string[] | null;
}

@Controller('probe')
class ProbeController {
    @Get('ok')
    ok(): { hello: string } {
        return { hello: 'world' };
    }

    @Get('type-error')
    typeError(): never {
        throw new TypeError('boom interno que no debe filtrarse');
    }

    @Get('db-unique')
    dbUnique(): never {
        const driverError = Object.assign(new Error('duplicate key'), {
            code: '23505',
            detail: 'Key (email)=(secreto@example.com) already exists.',
        });
        throw new QueryFailedError('INSERT INTO users ...', [], driverError);
    }

    @Post('validate')
    validate(@Body() dto: EchoDto): EchoDto {
        return dto;
    }
}

@Module({
    controllers: [ProbeController],
    providers: [
        {
            provide: APP_PIPE,
            useValue: new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        { provide: APP_FILTER, useClass: QueryFailedExceptionFilter },
        { provide: APP_FILTER, useClass: ValidationExceptionFilter },
    ],
})
class ProbeModule {}

describe('Sobre de respuesta estándar (filtros e interceptores globales)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [ProbeModule],
        }).compile();
        app = moduleRef.createNestApplication();
        app.useLogger(false);
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('envuelve los éxitos en { success, statusCode, message, data }', async () => {
        const res = await request(app.getHttpServer())
            .get('/probe/ok')
            .expect(200);
        expect(res.body).toEqual({
            success: true,
            statusCode: 200,
            message: 'Operación exitosa',
            data: { hello: 'world' },
        });
    });

    it('convierte errores no-HTTP (TypeError) en 500 con sobre estándar y sin detalles internos', async () => {
        const res = await request(app.getHttpServer())
            .get('/probe/type-error')
            .expect(500);
        expect(res.body).toMatchObject({
            success: false,
            statusCode: 500,
            message: 'Error interno del servidor',
            errors: null,
        });
        expect(JSON.stringify(res.body)).not.toContain('boom interno');
    });

    it('mapea violaciones de unicidad a 409 sin reflejar el valor enviado', async () => {
        const res = await request(app.getHttpServer())
            .get('/probe/db-unique')
            .expect(409);
        const body = res.body as ErrorEnvelope;
        expect(body).toMatchObject({
            success: false,
            statusCode: 409,
            errors: null,
        });
        expect(body.message).toContain('correo electrónico');
        expect(JSON.stringify(body)).not.toContain('secreto@example.com');
    });

    it('responde errores de validación con 400 y lista de errors', async () => {
        const res = await request(app.getHttpServer())
            .post('/probe/validate')
            .send({})
            .expect(400);
        const body = res.body as ErrorEnvelope;
        expect(body).toMatchObject({ success: false, statusCode: 400 });
        expect(Array.isArray(body.errors)).toBe(true);
        expect(body.errors?.length).toBeGreaterThan(0);
    });

    it('responde JSON malformado con 400 y sobre estándar', async () => {
        // Nest convierte el SyntaxError de body-parser en BadRequestException,
        // así que lo captura ValidationExceptionFilter (no el catch-all); lo
        // que se garantiza es el sobre, no por cuál filtro pasó.
        const res = await request(app.getHttpServer())
            .post('/probe/validate')
            .set('Content-Type', 'application/json')
            .send('{"value": ')
            .expect(400);
        const body = res.body as ErrorEnvelope;
        expect(body).toMatchObject({
            success: false,
            statusCode: 400,
        });
        expect(typeof body.message).toBe('string');
        expect(body).toHaveProperty('errors');
    });
});
