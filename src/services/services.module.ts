import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from './entities/service.entity';
import { ServiceItem } from './entities/service-item.entity';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { StorageModule } from '@/storage/storage.module';
import { MediaModule } from '@/media/media.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Service, ServiceItem]),
        StorageModule,
        MediaModule,
    ],
    controllers: [ServicesController],
    providers: [ServicesService],
})
export class ServicesModule {}
