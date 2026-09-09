// Búsqueda insensible a acentos SIN depender de la extensión `unaccent` de
// Postgres (que `synchronize` no crea en desarrollo). Se normaliza con
// `translate()`, que es built-in y funciona igual en dev y en producción.
//
// Cubre los diacríticos del español (vocales acentuadas, diéresis y ñ); no
// pretende ser universal. Se aplica sobre `lower(...)`, así que solo hacen
// falta las minúsculas.
const ACCENTED = 'áéíóúüñ';
const PLAIN = 'aeiouun';

/**
 * Devuelve un fragmento SQL para un WHERE que compara una columna con un
 * parámetro ignorando mayúsculas y acentos. Ej:
 *   qb.andWhere(accentInsensitiveLike('dt.name', 'search'), { search: `%${q}%` })
 * genera: translate(lower(dt.name), 'áéíóúüñ','aeiouun') LIKE translate(lower(:search), 'áéíóúüñ','aeiouun')
 */
export function accentInsensitiveLike(
    column: string,
    paramName: string,
): string {
    return (
        `translate(lower(${column}), '${ACCENTED}', '${PLAIN}') ` +
        `LIKE translate(lower(:${paramName}), '${ACCENTED}', '${PLAIN}')`
    );
}
