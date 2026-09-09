import { slugify, SLUG_PATTERN } from './slug.util';

describe('slug.util', () => {
    describe('slugify', () => {
        it('normaliza acentos, mayúsculas y separadores', () => {
            expect(slugify('Operación y Mantenimiento')).toBe(
                'operacion-y-mantenimiento',
            );
        });

        it('no deja guiones sueltos en los extremos', () => {
            expect(slugify('  ¡Well Testing!  ')).toBe('well-testing');
        });

        /**
         * El slug derivado del título NO pasa por el ValidationPipe, así que el
         * patrón del DTO no lo protege: un servicio titulado "Admin" quedaría
         * con slug "admin" y su ficha pública sería inalcanzable para siempre
         * (la captura @Get('admin'), declarado antes que @Get(':slug')).
         */
        it('esquiva los segmentos reservados que capturan las rutas del panel', () => {
            expect(slugify('Admin')).toBe('admin-1');
        });
    });

    describe('SLUG_PATTERN', () => {
        it.each(['operacion-y-mantenimiento', 'iso-9001', 'a1'])(
            'acepta %s',
            (valor) => {
                expect(SLUG_PATTERN.test(valor)).toBe(true);
            },
        );

        it.each([
            ['admin', 'colisiona con las rutas del panel'],
            ['Mayúsculas', 'tiene mayúsculas y acentos'],
            ['-empieza-con-guion', 'empieza con guion'],
            ['termina-con-guion-', 'termina con guion'],
            ['doble--guion', 'tiene guiones consecutivos'],
            ['con espacio', 'tiene espacios'],
        ])('rechaza %s porque %s', (valor) => {
            expect(SLUG_PATTERN.test(valor)).toBe(false);
        });

        // Servicios y novedades comparten estructura de rutas: el patrón vive en
        // un solo lugar justamente porque tenerlo duplicado los desincronizó.
        it('es el mismo que usan los DTO de servicios y de novedades', () => {
            const fuentes = [
                'src/services/dto/create-service.dto.ts',
                'src/news/dto/create-news-post.dto.ts',
            ].map((f) =>
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                (require('fs') as typeof import('fs')).readFileSync(f, 'utf8'),
            );

            for (const fuente of fuentes) {
                expect(fuente).toContain('@Matches(SLUG_PATTERN');
            }
        });
    });
});
