import { orphanKeys } from './orphan-keys.util';

describe('orphanKeys', () => {
    it('detecta la key reemplazada', () => {
        expect(orphanKeys(['media/a.png'], ['media/b.png'])).toEqual([
            'media/a.png',
        ]);
    });

    /**
     * El caso que motivó este helper: intercambiar dos imágenes de la misma
     * entidad. Campo por campo parecen dos reemplazos, pero las dos siguen en
     * uso y borrarlas dejaba al servicio sin ninguna foto.
     */
    it('NO considera huérfana una key que solo cambió de campo', () => {
        const antes = ['media/a.png', 'media/b.png', null];
        const despues = ['media/b.png', 'media/a.png', null];

        expect(orphanKeys(antes, despues)).toEqual([]);
    });

    it('detecta solo la que sale, en un intercambio parcial', () => {
        const antes = ['media/a.png', 'media/b.png'];
        const despues = ['media/b.png', 'media/c.png'];

        expect(orphanKeys(antes, despues)).toEqual(['media/a.png']);
    });

    it('ignora null y undefined de los dos lados', () => {
        expect(orphanKeys([null, undefined, 'media/a.png'], [undefined])).toEqual([
            'media/a.png',
        ]);
    });

    it('no repite una key usada en dos campos', () => {
        expect(
            orphanKeys(['media/a.png', 'media/a.png'], ['media/b.png']),
        ).toEqual(['media/a.png']);
    });

    it('sin cambios no devuelve nada', () => {
        const iguales = ['media/a.png', 'media/b.png'];
        expect(orphanKeys(iguales, iguales)).toEqual([]);
    });

    it('limpiar un campo (queda en null) marca la key como huérfana', () => {
        expect(orphanKeys(['media/a.png'], [null])).toEqual(['media/a.png']);
    });
});
