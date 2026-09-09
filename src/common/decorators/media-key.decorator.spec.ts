import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsMediaKey, normalizeMediaKey } from './media-key.decorator';

class Ejemplo {
    @IsMediaKey('La imagen')
    imagen: string;
}

const validar = async (
    valor: unknown,
): Promise<{ imagen: unknown; errores: string[] }> => {
    const dto = plainToInstance(Ejemplo, { imagen: valor });
    const errores = await validate(dto);
    return {
        imagen: dto.imagen,
        errores: errores.flatMap((e) => Object.values(e.constraints ?? {})),
    };
};

const KEY = 'media/2026/08/8efc7cc5-901f-4988-81da-7e5814d42013.png';

describe('normalizeMediaKey', () => {
    it('deja una key como está', () => {
        expect(normalizeMediaKey(KEY)).toBe(KEY);
    });

    it.each([
        ['https://petrogassa.com/' + KEY, 'el dominio de producción'],
        ['http://localhost:3000/' + KEY, 'el backend en desarrollo'],
        ['https://cdn.petrogassa.com/' + KEY, 'un CDN distinto del actual'],
    ])('extrae la key de %s (%s)', (url) => {
        expect(normalizeMediaKey(url)).toBe(KEY);
    });

    it('es idempotente', () => {
        expect(normalizeMediaKey(normalizeMediaKey('https://x.com/' + KEY))).toBe(
            KEY,
        );
    });
});

describe('IsMediaKey', () => {
    /**
     * El caso medido end-to-end: el GET devuelve la entidad con el campo pisado
     * por la URL absoluta, el panel la reenvía en el PATCH, y sin esto la base
     * guardaba la URL, la key vieja quedaba huérfana y el archivo se BORRABA
     * del disco. La respuesta era 200.
     */
    it('acepta la URL que devolvió el GET y la guarda como key', async () => {
        const { imagen, errores } = await validar('https://petrogassa.com/' + KEY);

        expect(errores).toEqual([]);
        expect(imagen).toBe(KEY);
    });

    it('acepta una key tal cual', async () => {
        const { imagen, errores } = await validar(KEY);

        expect(errores).toEqual([]);
        expect(imagen).toBe(KEY);
    });

    it.each([
        ['foto.png', 'un nombre de archivo suelto'],
        ['https://otro-sitio.com/foto.png', 'una URL ajena'],
        ['../../etc/passwd', 'un intento de salir de la raíz'],
        ['', 'la cadena vacía'],
    ])('rechaza %s (%s)', async (valor) => {
        const { errores } = await validar(valor);

        expect(errores.join(' ')).toContain('key del almacenamiento');
    });

    it('rechaza lo que no es texto', async () => {
        const { errores } = await validar(42);

        expect(errores.join(' ')).toContain('debe ser una key válida');
    });
});
