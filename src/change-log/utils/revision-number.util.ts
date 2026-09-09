/**
 * Número de revisión del sitio, como lo pide el control de documentos ISO.
 *
 * Se muestra con DOS DÍGITOS y sin punto: `01`, `02` … `99`. Antes se mostraba
 * `0.1 … 0.9, 1.0`, que era el mismo contador disfrazado de decimal; control de
 * documentos pidió sacarle el punto.
 *
 * En la base, `site_revisions.number` es un entero que crece para siempre y
 * nunca se repite: es la fuente de verdad y el que ordena. Lo que da la vuelta
 * es SOLO cómo se escribe. A partir de la revisión 100 —donde harían falta tres
 * dígitos— vuelve a `01`.
 *
 * ESO IMPLICA QUE LA ETIQUETA SE REPITE: la revisión 1 y la 100 se muestran las
 * dos como `01`. Lo que las distingue es la FECHA, que acompaña al número en
 * todos lados sin excepción —`revisionDate` en el pie del sitio, `occurredAt`
 * en cada asiento del registro, y la columna *Fecha* del Excel—, así que el par
 * (número, fecha) sigue siendo único. Si alguna vista futura muestra el número
 * solo, pierde esa garantía.
 *
 * A razón de una revisión por día con cambios, la vuelta llega recién a los 99
 * días en que se tocó algo: años, para este sitio.
 */

/** Última etiqueta antes de dar la vuelta. */
const MAX_ETIQUETA = 99;

/** Sin ninguna revisión: el contenido con el que el sitio salió a producción. */
export const REVISION_BASE = '00';

export function formatRevisionNumber(numero: number): string {
    if (!Number.isInteger(numero) || numero < 0) {
        throw new Error(
            `El número de revisión debe ser un entero no negativo, llegó ${numero}`,
        );
    }
    if (numero === 0) {
        return REVISION_BASE;
    }
    // 1..99 -> 01..99; 100 -> 01, 101 -> 02, y así.
    const etiqueta = ((numero - 1) % MAX_ETIQUETA) + 1;
    return String(etiqueta).padStart(2, '0');
}
