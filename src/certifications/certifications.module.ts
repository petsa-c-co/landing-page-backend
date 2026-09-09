import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certification } from './entities/certification.entity';
import { CertificationsService } from './certifications.service';
import { CertificationsController } from './certifications.controller';
import { StorageModule } from '@/storage/storage.module';
import { MediaModule } from '@/media/media.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Certification]),
        StorageModule,
        MediaModule,
    ],
    controllers: [CertificationsController],
    providers: [CertificationsService],
})
export class CertificationsModule {}
