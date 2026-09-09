import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { StorageModule } from '@/storage/storage.module';
import { MediaModule } from '@/media/media.module';

@Module({
    imports: [TypeOrmModule.forFeature([Client]), StorageModule, MediaModule],
    controllers: [ClientsController],
    providers: [ClientsService],
})
export class ClientsModule {}
