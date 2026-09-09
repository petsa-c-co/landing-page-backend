import { buildCorsOrigins } from './cors-origins.util';

describe('buildCorsOrigins', () => {
    describe('producción', () => {
        it('acepta ÚNICAMENTE el frontend configurado', () => {
            expect(
                buildCorsOrigins('https://panel.petrogassa.com', true),
            ).toEqual(['https://panel.petrogassa.com']);
        });

        it('no agrega localhost aunque el frontend sea local', () => {
            expect(buildCorsOrigins('http://localhost:5173', true)).toEqual([
                'http://localhost:5173',
            ]);
        });
    });

    describe('desarrollo', () => {
        it('suma localhost y 127.0.0.1 con el mismo puerto', () => {
            const origenes = buildCorsOrigins(
                'http://192.168.80.185:5173',
                false,
            );

            expect(origenes).toEqual([
                'http://192.168.80.185:5173',
                'http://localhost:5173',
                'http://127.0.0.1:5173',
            ]);
        });

        it('respeta el puerto configurado en vez de fijar uno', () => {
            expect(buildCorsOrigins('http://192.168.1.10:4200', false)).toContain(
                'http://localhost:4200',
            );
        });

        it('no duplica si el frontend ya es localhost', () => {
            const origenes = buildCorsOrigins('http://localhost:5173', false);

            expect(origenes).toContain('http://localhost:5173');
            expect(
                origenes.filter((o) => o === 'http://localhost:5173'),
            ).toHaveLength(1);
        });

        it('mantiene el protocolo (https no se degrada a http)', () => {
            expect(buildCorsOrigins('https://mi-red.local:8443', false)).toEqual(
                expect.arrayContaining(['https://localhost:8443']),
            );
        });
    });

    it('quita la barra final: el header Origin nunca la lleva', () => {
        expect(buildCorsOrigins('https://petrogassa.com/', true)).toEqual([
            'https://petrogassa.com',
        ]);
    });

    it('con la variable vacía no habilita ningún origen', () => {
        expect(buildCorsOrigins('', false)).toEqual([]);
    });
});
