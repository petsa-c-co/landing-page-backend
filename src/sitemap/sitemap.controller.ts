import { Controller, Get, Header } from '@nestjs/common';
import { SitemapService } from './sitemap.service';
import { IgnoreResponseInterceptor } from '@/common/decorators/ignore-response-interceptor.decorator';

/**
 * Sitemap del sitio público.
 *
 * Vive FUERA del prefijo /api (se excluye en main.ts) porque los buscadores lo
 * piden en la raíz del dominio, y devuelve XML crudo: si saliera dentro del
 * sobre estándar `{ success, data, ... }` o con content-type JSON, Google
 * descarta el archivo. De ahí el @IgnoreResponseInterceptor.
 */
@Controller()
export class SitemapController {
    constructor(private readonly sitemapService: SitemapService) {}

    @Get('sitemap.xml')
    @IgnoreResponseInterceptor()
    @Header('Content-Type', 'application/xml; charset=utf-8')
    // Los buscadores lo consultan de forma esporádica; una hora de caché evita
    // recalcularlo ante pedidos repetidos sin retrasar la publicación real.
    @Header('Cache-Control', 'public, max-age=3600')
    sitemap(): Promise<string> {
        return this.sitemapService.build();
    }
}
