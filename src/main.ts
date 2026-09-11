import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import helmet from 'helmet';
import * as path from 'path';
import * as yaml from 'yamljs';
import type { ServerResponse } from 'http';
import { buildCorsOrigins } from './common/utils/cors-origins.util';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    const isProduction = process.env.NODE_ENV === 'production';

    // En producción los contenedores publican el puerto solo en 127.0.0.1, por
    // lo que SIEMPRE hay un reverse proxy delante. Sin esto, el rate limiter ve
    // una sola IP (la del proxy) y todos los clientes comparten el mismo cupo.
    // En desarrollo NO hay proxy: no se confía en X-Forwarded-For (spoofeable).
    app.set('trust proxy', isProduction ? 1 : false);

    app.use(helmet());

    // CORS para que el frontend lea/envíe cookies. En producción se acepta
    // ÚNICAMENTE FRONTEND_URL; en desarrollo se suman las variantes locales del
    // mismo puerto (localhost / 127.0.0.1), porque el panel se abre tanto por IP
    // de red como por localhost y el header Origin se compara exacto.
    app.enableCors({
        origin: buildCorsOrigins(process.env.FRONTEND_URL ?? '', isProduction),
        credentials: true, // Vital para que el navegador acepte las cookies
    });

    // El sitemap queda fuera del prefijo: los buscadores lo piden en la raíz
    // del dominio (https://petrogassa.com/sitemap.xml), no bajo /api.
    app.setGlobalPrefix('api', {
        exclude: [{ path: 'sitemap.xml', method: RequestMethod.GET }],
    });

    // Archivos públicos (imágenes del sitio) servidos desde el almacenamiento
    // en filesystem —un montaje NFS en producción—. Se publica la carpeta
    // `public/` ENTERA, que es la única que existe: no hay área privada, y
    // StorageService tampoco sabe escribir fuera de ahí.
    //
    // Las rutas de la API cuelgan de /api, así que no hay colisión. Si mañana
    // ponen nginx o un CDN a servir esta misma carpeta, alcanza con apuntar
    // MEDIA_PUBLIC_BASE_URL ahí: el backend no necesita cambios.
    const storageRoot = path.resolve(process.env.STORAGE_PATH ?? './storage');
    app.useStaticAssets(path.join(storageRoot, 'public'), {
        // Los nombres son UUID irrepetibles: al reemplazar una imagen cambia la
        // key, así que el contenido de una URL nunca cambia y se puede cachear
        // agresivamente.
        maxAge: '1y',
        immutable: true,
        index: false,
        redirect: false,
        setHeaders: (res: ServerResponse): void => {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
    });

    app.use(cookieParser());

    // El cuerpo de una nota de prensa puede superar los 100 kb por defecto de
    // Express. Los archivos (multipart) los limita multer por su lado.
    app.use(json({ limit: '1mb' }));
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
// Sin este catch, cualquier fallo al arrancar —config inválida, base
// inaccesible, openapi.yaml malformado— termina como un
// UnhandledPromiseRejection con el motivo "[object Object]": sin stack, sin
// archivo y sin línea. Acá se imprime el detalle real y se sale con código 1.
bootstrap().catch((err: unknown) => {
    const detalle =
        err instanceof Error
            ? (err.stack ?? err.message)
            : JSON.stringify(err, null, 2);
    console.error(`No se pudo iniciar la aplicación:\n${detalle}`);
    process.exit(1);
});
