/**
 * Keys de archivo que quedaron sin uso tras una actualización.
 *
 * Se compara el conjunto COMPLETO de antes contra el COMPLETO de después, en vez
 * de ir anotando reemplazos campo por campo. La diferencia importa cuando una
 * entidad tiene varias imágenes: si se intercambian dos (la de tarjeta pasa a
 * banner y viceversa), campo por campo se ven dos reemplazos y se borrarían los
 * dos archivos, cuando en realidad los dos siguen en uso.
 *
 * Sin `null`/`undefined` y sin repetidos: una misma key usada en dos campos se
 * evalúa una sola vez.
 */
export function orphanKeys(
    antes: readonly (string | null | undefined)[],
    despues: readonly (string | null | undefined)[],
): string[] {
    const enUso = new Set(despues.filter((k): k is string => !!k));
    const huerfanas = new Set(
        antes.filter((k): k is string => !!k && !enUso.has(k)),
    );
    return [...huerfanas];
}
