import {
    REVISION_BASE,
    formatRevisionNumber,
} from './revision-number.util';
import { argentinaDay } from './argentina-day.util';

describe('formatRevisionNumber', () => {
    it.each([
        [1, '01'],
        [2, '02'],
        [9, '09'],
        [10, '10'],
        [11, '11'],
        [42, '42'],
        [99, '99'],
    ])('%i -> %s', (numero, esperado) => {
        expect(formatRevisionNumber(numero)).toBe(esperado);
    });

    /**
     * Control de documentos pidió dos dígitos siempre. Donde harían falta tres
     * —la revisión 100— la etiqueta vuelve a empezar.
     *
     * El precio es que la etiqueta se repite: la 1 y la 100 se muestran igual.
     * Lo que las distingue es la fecha, que acompaña al número en el pie, en
     * cada asiento y en el Excel. En la base el entero sigue creciendo y nunca
     * se repite.
     */
    it.each([
        [100, '01'],
        [101, '02'],
        [198, '99'],
        [199, '01'],
    ])('a los tres dígitos vuelve a dos: %i -> %s', (numero, esperado) => {
        expect(formatRevisionNumber(numero)).toBe(esperado);
    });

    it('nunca escribe tres dígitos ni un punto', () => {
        for (let n = 1; n <= 300; n++) {
            expect(formatRevisionNumber(n)).toMatch(/^\d{2}$/);
        }
    });

    // Sin ningún día con cambios, el sitio está en su línea de base: es lo que
    // el footer mostraba hardcodeado antes de que esto existiera.
    it('la línea de base es 00', () => {
        expect(REVISION_BASE).toBe('00');
        expect(formatRevisionNumber(0)).toBe('00');
    });

    it.each([-1, 1.5, NaN])('rechaza %p en vez de inventar un número', (malo) => {
        expect(() => formatRevisionNumber(malo)).toThrow();
    });
});

/**
 * El día decide a qué revisión pertenece un cambio, así que una zona horaria
 * mal resuelta corre el número. Argentina es UTC-3 todo el año.
 */
describe('argentinaDay', () => {
    it('un cambio de noche pertenece al día argentino, no al del UTC', () => {
        // 02:30 UTC del 28 son las 23:30 del 27 en Argentina.
        expect(argentinaDay(new Date('2026-08-28T02:30:00Z'))).toBe('2026-08-27');
    });

    it('y a partir de las 03:00 UTC ya es el día siguiente', () => {
        expect(argentinaDay(new Date('2026-08-28T03:00:00Z'))).toBe('2026-08-28');
    });

    it('el mediodía no tiene vueltas', () => {
        expect(argentinaDay(new Date('2026-08-28T15:00:00Z'))).toBe('2026-08-28');
    });

    it('devuelve el formato que espera una columna date', () => {
        expect(argentinaDay(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
    });
});
