import {
    ClassSerializerInterceptor,
    MiddlewareConsumer,
    Module,
    NestModule,
    RequestMethod,
    ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
    APP_FILTER,
    APP_GUARD,
    APP_INTERCEPTOR,
    APP_PIPE,
} from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { validationSchema } from './config/validation.schema';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from './mail/mail.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { StorageModule } from './storage/storage.module';
import { MediaModule } from './media/media.module';
import { ServicesModule } from './services/services.module';
import { CertificationsModule } from './certifications/certifications.module';
import { ClientsModule } from './clients/clients.module';
import { NewsModule } from './news/news.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { ContactModule } from './contact/contact.module';
import { SitemapModule } from './sitemap/sitemap.module';
import { SiteSettingsModule } from './site-settings/site-settings.module';
import { ChangeLogModule } from './change-log/change-log.module';
import { AuditContextMiddleware } from './change-log/audit-context.middleware';
import { SeedModule } from './seed/seed.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { QueryFailedExceptionFilter } from './common/filters/query-failed-exception.filter';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath:
                process.env.NODE_ENV === 'production'
                    ? '.env.prod'
                    : '.env.dev',
            validationSchema,
            validationOptions: {
                abortEarly: false,
                allowUnknown: true,
            },
        }),
        TypeOrmModule.forRootAsync({
            useFactory: () => ({
                type: 'postgres',
                host: process.env.DATABASE_HOST,
                port: Number(process.env.DATABASE_PORT),
                username: process.env.DATABASE_USER,
                password: process.env.DATABASE_PASSWORD,
                database: process.env.DATABASE_NAME,
                autoLoadEntities: true,
                synchronize: process.env.NODE_ENV === 'development',
            }),
        }),
        // Límite global generoso aplicado a TODAS las rutas (ver APP_GUARD).
        // Los endpoints de auth lo endurecen con @Throttle en su controlador.
        ThrottlerModule.forRoot({
            throttlers: [
                {
                    ttl: 60000, // 60 segundos
                    limit: 100, // 100 peticiones/min por IP
                },
            ],
            errorMessage:
                'Demasiadas peticiones, por favor intenta de nuevo más tarde',
        }),
        UsersModule,
        AuthModule,
        MailModule,
        StorageModule,
        MediaModule,
        ServicesModule,
        CertificationsModule,
        ClientsModule,
        NewsModule,
        // "Trabajá con nosotros": el formulario público y los puestos son un
        // PUENTE hacia Gestión Petrogas (no se guarda nada de eso acá); el
        // catálogo de títulos académicos sí es nuestro.
        RecruitmentModule,
        ContactModule,
        SiteSettingsModule,
        SitemapModule,
        SeedModule,
        ChangeLogModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        // Rate limiting global: protege todas las rutas, no solo /auth.
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
        // Pipes/interceptores/filtros globales registrados como providers (y no
        // en main.ts) para que los tests e2e ejerciten la misma configuración
        // que producción.
        {
            provide: APP_PIPE,
            useValue: new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        },
        // Interceptores: ClassSerializer se registra ÚLTIMO para que serialice
        // las entidades (aplicando @Exclude sobre password) ANTES de que
        // ResponseInterceptor las envuelva en el formato { success, data }.
        {
            provide: APP_INTERCEPTOR,
            useClass: ResponseInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: ClassSerializerInterceptor,
        },
        // Filtros: Nest los evalúa en orden INVERSO al registro. El catch-all
        // (AllExceptionsFilter) va PRIMERO para que solo actúe cuando ningún
        // filtro específico capturó la excepción, y el más específico
        // (ValidationExceptionFilter -> BadRequestException) va último para
        // capturar antes que HttpExceptionFilter.
        {
            provide: APP_FILTER,
            useClass: AllExceptionsFilter,
        },
        {
            provide: APP_FILTER,
            useClass: HttpExceptionFilter,
        },
        {
            provide: APP_FILTER,
            useClass: QueryFailedExceptionFilter,
        },
        {
            provide: APP_FILTER,
            useClass: ValidationExceptionFilter,
        },
    ],
})
export class AppModule implements NestModule {
    /**
     * Abre el contexto de auditoría para TODOS los requests.
     *
     * Va como middleware y no como interceptor a propósito: un interceptor
     * devuelve el Observable y Nest se suscribe fuera del contexto de
     * AsyncLocalStorage, así que se perdería el usuario y cada cambio quedaría
     * registrado como "sistema" sin ningún síntoma. Ver audit-context.middleware.ts.
     */
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(AuditContextMiddleware)
            .forRoutes({ path: '*path', method: RequestMethod.ALL });
    }
}
