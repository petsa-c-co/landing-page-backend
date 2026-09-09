import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SitemapController } from './sitemap.controller';
import { SitemapService } from './sitemap.service';
import { Service } from '@/services/entities/service.entity';
import { NewsPost } from '@/news/entities/news-post.entity';

// Solo lectura: registra las entidades que lista el sitemap sin depender de los
// módulos que las gestionan.
@Module({
    imports: [TypeOrmModule.forFeature([Service, NewsPost])],
    controllers: [SitemapController],
    providers: [SitemapService],
})
export class SitemapModule {}
