import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NewsPost } from './entities/news-post.entity';
import { LinkedInImport } from './entities/linkedin-import.entity';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { LinkedInController } from './linkedin/linkedin.controller';
import { LinkedInImportService } from './linkedin/linkedin.service';
import {
    LINKEDIN_SOURCE,
    LinkedInSource,
} from './linkedin/linkedin-source.interface';
import { LinkedInApiSource } from './linkedin/linkedin-api.source';
import { LinkedInStubSource } from './linkedin/linkedin-stub.source';
import { StorageModule } from '@/storage/storage.module';
import { MediaModule } from '@/media/media.module';

/**
 * Elige la fuente de posteos de LinkedIn.
 *
 * `LINKEDIN_FETCH_MODE=api` usa la Community Management API real (requiere que
 * LinkedIn haya aprobado el acceso al producto); cualquier otro valor usa el
 * stub de desarrollo.
 *
 * En PRODUCCIÓN el stub queda prohibido, aunque la variable diga 'stub'. Sus
 * posteos son inventados pero en el panel se ven idénticos a los reales —autor
 * "Petrogas S.A.", fechas creíbles, link "Ver original"—, y aprobar uno lo
 * publica al instante en el sitio corporativo con un permalink que no existe.
 * Sin credenciales, la fuente real responde 503 con un mensaje claro: es
 * preferible que el sync falle a que invente contenido a nombre de la empresa.
 *
 * Exportada para poder probar justamente eso.
 */
export function resolveLinkedInSource(config: ConfigService): LinkedInSource {
    const enProduccion = config.get<string>('NODE_ENV') === 'production';
    const modoApi = config.get<string>('LINKEDIN_FETCH_MODE') === 'api';

    return modoApi || enProduccion
        ? new LinkedInApiSource(config)
        : new LinkedInStubSource();
}

@Module({
    imports: [
        TypeOrmModule.forFeature([NewsPost, LinkedInImport]),
        StorageModule,
        MediaModule,
    ],
    controllers: [NewsController, LinkedInController],
    providers: [
        NewsService,
        LinkedInImportService,
        {
            provide: LINKEDIN_SOURCE,
            useFactory: resolveLinkedInSource,
            inject: [ConfigService],
        },
    ],
})
export class NewsModule {}
