import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';
import { MEDIA_KEY_PREFIX } from '@/storage/storage.constants';

/**
 * Una key del almacenamiento: `media/<año>/<mes>/<uuid>.<ext>`.
 */
const KEY_VALIDA = new RegExp(`^${MEDIA_KEY_PREFIX}[A-Za-z0-9._/-]+$`);

/**
 * Devuelve la key de una URL pública del almacenamiento, o el valor tal cual si
 * ya es una key.
 *
 * Existe por un problema medido end-to-end: los GET devuelven la entidad con el
 * campo PISADO por la URL absoluta (ver los `withImageUrl` de cada servicio), y
 * el panel reenvía en el PATCH lo que le dio el GET —el patrón más común, cargar
 * el formulario con la respuesta y mandarla de vuelta—. Sin normalizar, la base
 * terminaba guardando una URL donde va una key, la key vieja quedaba sin dueño y
 * el archivo se BORRABA del disco. El panel respondía 200 y nadie se enteraba
 * hasta que la imagen dejaba de verse.
 *
 * No se compara contra MEDIA_PUBLIC_BASE_URL a propósito: si mañana esa variable
 * apunta a un CDN, las URLs viejas guardadas en la base siguen teniendo el host
 * anterior y tienen que seguir normalizando igual.
 */
export function normalizeMediaKey(valor: string): string {
    const limpio = valor.trim();
    // Cualquier origen: http(s)://host[:puerto]/  →  se queda con el resto.
    const sinOrigen = limpio.replace(/^https?:\/\/[^/]+\//i, '');
    return sinOrigen.replace(/^\/+/, '');
}

/**
 * Campo que guarda una key del almacenamiento (imagen o PDF).
 *
 * Normaliza primero y valida después: una URL nuestra se acepta y se guarda como
 * key; cualquier otra cosa da 400 con el mensaje del campo, en vez de guardarse
 * y llevarse el archivo puesto.
 */
export function IsMediaKey(etiqueta: string): PropertyDecorator {
    return applyDecorators(
        IsString({ message: `${etiqueta} debe ser una key válida` }),
        MaxLength(500),
        Transform(({ value }: { value: unknown }) =>
            typeof value === 'string' ? normalizeMediaKey(value) : value,
        ),
        Matches(KEY_VALIDA, {
            message: `${etiqueta} debe ser una key del almacenamiento (empieza con "${MEDIA_KEY_PREFIX}"), no una URL ni un nombre de archivo suelto`,
        }),
    );
}
