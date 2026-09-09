import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteSettings } from './entities/site-settings.entity';
import { SiteImage } from './entities/site-image.entity';
import { SiteSettingsService } from './site-settings.service';
import { SiteImagesService } from './site-images.service';
import { SiteSettingsController } from './site-settings.controller';
import { SiteImagesController } from './site-images.controller';
import { StorageModule } from '@/storage/storage.module';
import { MediaModule } from '@/media/media.module';
import { ChangeLogModule } from '@/change-log/change-log.module';

@Module({
    imports: [
        ChangeLogModule,
        TypeOrmModule.forFeature([SiteSettings, SiteImage]),
        StorageModule,
        MediaModule,
    ],
    // El controlador de /site-settings/images va PRIMERO: sus rutas son más
    // específicas que las de /site-settings.
    controllers: [SiteImagesController, SiteSettingsController],
    providers: [SiteSettingsService, SiteImagesService],
})
export class SiteSettingsModule {}
