import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as path from 'path';
import * as yaml from 'yamljs';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    const isProduction = process.env.NODE_ENV === 'production';

    // En producción los contenedores publican el puerto solo en 127.0.0.1, por
    // lo que SIEMPRE hay un reverse proxy delante. Sin esto, el rate limiter ve
    // una sola IP (la del proxy) y todos los clientes comparten el mismo cupo.
    // En desarrollo NO hay proxy: no se confía en X-Forwarded-For (spoofeable).
    app.set('trust proxy', isProduction ? 1 : false);

    // Cabeceras de seguridad (HSTS, X-Content-Type-Options, etc.)
    app.use(helmet());

    // CORS para que el frontend lea/envíe cookies. FRONTEND_URL es obligatoria
    // (la valida Joi); se le quita la barra final porque el header Origin nunca
    // la lleva y el match es exacto.
    app.enableCors({
        origin: (process.env.FRONTEND_URL ?? '').replace(/\/+$/, ''),
        credentials: true, // Vital para que el navegador acepte las cookies
    });

    app.setGlobalPrefix('api');
    app.use(cookieParser());

    // Pipes, interceptores y filtros globales se registran como providers
    // (APP_PIPE / APP_INTERCEPTOR / APP_FILTER) en AppModule, de modo que los
    // tests e2e ejerciten exactamente la misma configuración.

    // Documentación OpenAPI: solo fuera de producción. Además de reducir la
    // superficie expuesta, evita que la imagen de producción (que no incluye
    // openapi.yaml) falle al arrancar.
    if (!isProduction) {
        const yamlFilePath = path.join(process.cwd(), 'openapi.yaml');
        const document = yaml.load(yamlFilePath) as unknown as OpenAPIObject;

        SwaggerModule.setup('api/docs', app, document, {
            customSiteTitle: 'Petrogassa API Docs',
            swaggerOptions: {
                persistAuthorization: true,
            },
        });
    }

    // Cierre ordenado: permite a TypeORM cerrar conexiones al recibir SIGTERM.
    app.enableShutdownHooks();

    await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
