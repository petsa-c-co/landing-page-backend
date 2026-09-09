/**
 * Segmentos que NO pueden ser un slug porque colisionan con rutas del panel.
 *
 * Los controllers que exponen `@Get(':slug')` declaran antes `@Get('admin')` y
 * `@Get('admin/trash')`, y Nest resuelve por orden de declaración: un item con
 * slug "admin" queda inalcanzable para siempre desde el sitio público, y el
 * visitante recibe el 401 del listado de administración. No da error al crearlo,
 * así que se descubre cuando alguien reporta que la ficha no abre.
 */
const SEGMENTOS_RESERVADOS = ['admin'];

/**
 * Slug válido para URL: minúsculas, números y guiones simples, sin empezar ni
 * terminar en guion, y sin usar un segmento reservado.
 *
 * Vive acá y no en cada DTO porque servicios y novedades comparten la misma
 * estructura de rutas: tenerlo duplicado hizo que uno lo vetara y el otro no.
 */
export const SLUG_PATTERN = new RegExp(
    `^(?!(?:${SEGMENTOS_RESERVADOS.join('|')})$)[a-z0-9]+(?:-[a-z0-9]+)*$`,
);

export const SLUG_MESSAGE =
    'El slug solo admite minúsculas, números y guiones (y no puede ser "admin")';

/**
 * Convierte un título en un slug apto para URL: minúsculas, sin acentos,
 * separado por guiones. Ej: "Operación y Mantenimiento" -> "operacion-y-mantenimiento".
 *
 * Si el resultado cae en un segmento reservado se le agrega un sufijo, porque
 * el slug derivado del título NO pasa por la validación del DTO.
 */
export function slugifyBase(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // quita diacríticos (á -> a)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function slugify(value: string): string {
    const base = slugifyBase(value);
    return SEGMENTOS_RESERVADOS.includes(base) ? `${base}-1` : base;
}
