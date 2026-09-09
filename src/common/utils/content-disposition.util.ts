/**
 * Arma el valor de `Content-Disposition` para una descarga.
 *
 * Las cabeceras HTTP viajan en ISO-8859-1, así que un nombre con acentos puesto
 * directamente en `filename=` llega roto ("P?rez", "PÃ©rez") según el cliente.
 * El RFC 6266 resuelve esto con `filename*`, que admite UTF-8 percent-encoded.
 * Se mandan LOS DOS: los navegadores actuales usan `filename*` y conservan el
 * acento; cualquier cliente viejo cae en la versión ASCII.
 *
 * La versión ASCII quita los diacríticos en vez de reemplazarlos por guiones
 * bajos, porque "Perez" se lee mucho mejor que "P_rez".
 *
 * También se descartan comillas y barras invertidas: el nombre lo carga un
 * usuario y, sin sanear, podría cerrar la comilla y alterar la cabecera.
 */
export function attachmentDisposition(filename: string): string {
    const ascii = filename
        // NFD separa la letra de su tilde, y así se puede borrar solo la tilde.
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/["\\]/g, '');

    return (
        `attachment; filename="${ascii}"; ` +
        `filename*=UTF-8''${encodeURIComponent(filename)}`
    );
}
