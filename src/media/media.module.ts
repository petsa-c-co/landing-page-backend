import { Module } from '@nestjs/common';
import { StorageModule } from '@/storage/storage.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaReferencesService } from './media-references.service';

/**
 * MediaReferencesService se EXPORTA porque lo consumen los módulos de contenido
 * para limpiar imágenes al reemplazarlas. Es el único lugar donde está escrito
 * qué entidad usa qué archivo.
 */
@Module({
    imports: [StorageModule],
    controllers: [MediaController],
    providers: [MediaService, MediaReferencesService],
    exports: [MediaReferencesService],
})
export class MediaModule {}
