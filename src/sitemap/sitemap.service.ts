import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '@/services/entities/service.entity';
import { NewsPost } from '@/news/entities/news-post.entity';

/**
 * Páginas fijas del sitio. Van a mano porque no viven en la base: las arma el
 * frontend. Si se agrega una sección nueva, se agrega también acá.
 */
const RUTAS_FIJAS = [
    '/',
    '/nosotros',
    '/servicios',
    '/certificaciones',
    '/rrhh',
    '/trabaja-con-nosotros',
    '/novedades-y-prensa',
    '/contacto',
] as const;

// Los slugs son kebab-case y la base viene de configuración, así que en la
// práctica no hay caracteres conflictivos; se escapa igual porque un sitemap
// mal formado hace que Google descarte el archivo entero.
function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// <lastmod> admite solo la fecha; es la variante que recomienda sitemaps.org.
function soloFecha(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
}

@Injectable()
export class SitemapService {
    constructor(
        @InjectRepository(Service)
        private readonly serviceRepository: Repository<Service>,
        @InjectRepository(NewsPost)
        private readonly newsRepository: Repository<NewsPost>,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Arma el sitemap del sitio público.
     *
     * Las condiciones replican EXACTAMENTE las del sitio: un servicio se sirve
     * si `isActive`, y una nota si `isPublished` (ver findOneBySlug de cada
     * servicio). Publicar acá una URL que el sitio responde con 404 perjudica el
     * posicionamiento, así que los filtros tienen que seguir siendo el mismo.
     *
     * El borrado lógico no necesita condición explícita: ambas entidades tienen
     * @DeleteDateColumn y TypeORM excluye las filas en papelera salvo que se
     * pida `withDeleted`. Hay un test que lo fija, para que no se pierda si
     * alguien cambia estas consultas.
     */
    async build(): Promise<string> {
        const base = this.baseUrl();

        const [servicios, notas] = await Promise.all([
            this.serviceRepository.find({
                where: { isActive: true },
                select: { slug: true, updatedAt: true },
                order: { slug: 'ASC' },
            }),
            this.newsRepository.find({
                where: { isPublished: true },
                select: { slug: true, updatedAt: true },
                order: { slug: 'ASC' },
            }),
        ]);

        const urls = [
            ...RUTAS_FIJAS.map((ruta) => this.url(`${base}${ruta}`)),
            ...servicios.map((s) =>
                this.url(`${base}/servicios/${s.slug}`, s.updatedAt),
            ),
            ...notas.map((n) =>
                this.url(`${base}/novedades-y-prensa/${n.slug}`, n.updatedAt),
            ),
        ];

        // Sin espacios ni saltos antes de la declaración XML: tienen que ser los
        // primeros bytes del archivo.
        return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
    }

    private url(loc: string, lastmod?: Date): string {
        const fecha = lastmod
            ? `\n        <lastmod>${soloFecha(lastmod)}</lastmod>`
            : '';
        return `    <url>\n        <loc>${escapeXml(loc)}</loc>${fecha}\n    </url>`;
    }

    // Sin barra final, para que al concatenar las rutas no queden dobles.
    private baseUrl(): string {
        return (this.configService.get<string>('PUBLIC_SITE_URL') ?? '').replace(
            /\/+$/,
            '',
        );
    }
}
