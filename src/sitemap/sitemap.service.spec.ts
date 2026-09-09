import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { SitemapService } from './sitemap.service';
import { Service } from '@/services/entities/service.entity';
import { NewsPost } from '@/news/entities/news-post.entity';

describe('SitemapService', () => {
    let service: SitemapService;
    let serviciosRepo: { find: jest.Mock };
    let notasRepo: { find: jest.Mock };

    const build = async (
        servicios: Partial<Service>[] = [],
        notas: Partial<NewsPost>[] = [],
        base = 'https://petrogassa.com',
    ): Promise<string> => {
        serviciosRepo.find.mockResolvedValue(servicios);
        notasRepo.find.mockResolvedValue(notas);
        service = new SitemapService(
            serviciosRepo as unknown as Repository<Service>,
            notasRepo as unknown as Repository<NewsPost>,
            { get: (): string => base } as unknown as ConfigService,
        );
        return service.build();
    };

    beforeEach(() => {
        serviciosRepo = { find: jest.fn() };
        notasRepo = { find: jest.fn() };
    });

    it('arranca con la declaración XML en el primer byte', async () => {
        const xml = await build();
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(
            true,
        );
        expect(xml).toContain(
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        );
        expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
    });

    it('incluye las 8 rutas fijas del sitio', async () => {
        const xml = await build();
        for (const ruta of [
            '/',
            '/nosotros',
            '/servicios',
            '/certificaciones',
            '/rrhh',
            '/trabaja-con-nosotros',
            '/novedades-y-prensa',
            '/contacto',
        ]) {
            expect(xml).toContain(`<loc>https://petrogassa.com${ruta}</loc>`);
        }
        expect(xml.match(/<url>/g)).toHaveLength(8);
    });

    it('agrega servicios y notas con su lastmod en formato fecha', async () => {
        const xml = await build(
            [{ slug: 'well-testing', updatedAt: new Date('2026-03-14T10:20:30Z') }],
            [{ slug: 'nueva-planta', updatedAt: new Date('2026-07-01T23:00:00Z') }],
        );

        expect(xml).toContain(
            '<loc>https://petrogassa.com/servicios/well-testing</loc>',
        );
        expect(xml).toContain('<lastmod>2026-03-14</lastmod>');
        expect(xml).toContain(
            '<loc>https://petrogassa.com/novedades-y-prensa/nueva-planta</loc>',
        );
        expect(xml).toContain('<lastmod>2026-07-01</lastmod>');
        expect(xml.match(/<url>/g)).toHaveLength(10);
    });

    it('las rutas fijas no llevan lastmod (no sabemos cuándo cambiaron)', async () => {
        const xml = await build();
        expect(xml).not.toContain('<lastmod>');
    });

    /**
     * Esta es la garantía que más importa: si el sitemap listara un borrador o
     * algo de la papelera, Google indexaría una URL que responde 404.
     */
    it('pide SOLO lo publicado y deja que el borrado lógico filtre la papelera', async () => {
        await build();

        const [filtroServicios] = serviciosRepo.find.mock.calls[0] as [
            { where: unknown; withDeleted?: boolean },
        ];
        const [filtroNotas] = notasRepo.find.mock.calls[0] as [
            { where: unknown; withDeleted?: boolean },
        ];

        expect(filtroServicios.where).toEqual({ isActive: true });
        expect(filtroNotas.where).toEqual({ isPublished: true });
        // Sin withDeleted, TypeORM excluye la papelera; pedirlo rompería el SEO.
        expect(filtroServicios.withDeleted).toBeUndefined();
        expect(filtroNotas.withDeleted).toBeUndefined();
    });

    it('no duplica la barra si la URL base viene con una al final', async () => {
        const xml = await build(
            [{ slug: 'perforacion', updatedAt: new Date('2026-01-01T00:00:00Z') }],
            [],
            'https://petrogassa.com/',
        );

        expect(xml).toContain(
            '<loc>https://petrogassa.com/servicios/perforacion</loc>',
        );
        expect(xml).not.toContain('petrogassa.com//');
    });

    it('escapa los caracteres que romperían el XML', async () => {
        const xml = await build(
            [{ slug: 'a&b<c', updatedAt: new Date('2026-01-01T00:00:00Z') }],
            [],
        );

        expect(xml).toContain('a&amp;b&lt;c');
        expect(xml).not.toContain('a&b<c');
    });
});
