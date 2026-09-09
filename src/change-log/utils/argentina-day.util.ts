/**
 * El día calendario argentino de un instante, como `YYYY-MM-DD`.
 *
 * Existe porque el número de revisión agrupa **por día**, así que qué día es
 * decide qué número le toca a un cambio. Un cambio a las 21:30 en Neuquén ya es
 * del día siguiente en UTC: sin esto, editar de noche empujaría la revisión un
 * día antes de tiempo.
 *
 * Se calcula en TypeScript y no en SQL a propósito. Un `now()::date` depende de
 * la zona de la sesión de Postgres, que nadie fija —los compose no declaran
 * `TZ`—, y además así se puede probar con un instante fijo. El mismo mordisco
 * ya está documentado en mail.service.ts.
 *
 * `en-CA` devuelve el formato ISO directo (`2026-08-27`), que es justo lo que
 * necesita la columna `date`.
 */
const ZONA = 'America/Argentina/Buenos_Aires';

const formateador = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export function argentinaDay(instante: Date = new Date()): string {
    return formateador.format(instante);
}
