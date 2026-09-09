// Detección de CONTENIDO ACTIVO en un PDF: JavaScript embebido, archivos
// adjuntos y acciones que lanzan programas externos.
//
// ALCANCE, y conviene leerlo antes de confiar en esto:
//
// Esto NO es un antivirus. Atrapa lo evidente —un PDF armado con un generador
// común que mete un /JavaScript al abrir— y nada más. Un PDF con los objetos
// comprimidos dentro de un /ObjStm esconde estos marcadores y pasa limpio;
// descomprimirlo requiere una librería de PDF entera, que es justo la
// dependencia que se decidió no agregar. Y un exploit del lector no deja
// ningún marcador que buscar.
//
// El valor real es acotado y honesto: sube el costo de lo trivial. Si en algún
// momento hace falta una defensa de verdad, es un antivirus (ClamAV) del lado
// donde el archivo se guarda y se abre, que es Gestión, no este caño.

/**
 * Marcadores de contenido activo.
 *
 * `/OpenAction` queda AFUERA a propósito: es común y casi siempre benigno —fija
 * el zoom o la página inicial y lo agrega medio mundo al exportar—, así que
 * rechazarlo tiraría abajo CV legítimos. Lo peligroso es que apunte a
 * JavaScript, y el JavaScript se rechaza por su cuenta.
 */
const MARCADORES = ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile'] as const;

/**
 * Delimitadores que el formato PDF admite después del nombre de un objeto.
 *
 * Se exige uno para no marcar como sospechoso cualquier binario que por
 * casualidad contenga la secuencia (`/JS` son tres bytes, aparece solo).
 */
const DELIMITADORES = new Set([
    0x20, 0x0a, 0x0d, 0x09, 0x00, 0x0c, // espacios en blanco
    0x2f, 0x3c, 0x3e, 0x5b, 0x5d, 0x28, 0x29, // / < > [ ] ( )
]);

/**
 * Devuelve el primer marcador de contenido activo encontrado, o null si el PDF
 * no tiene ninguno.
 *
 * Devuelve CUÁL marcador y no un booleano para poder registrarlo: si empiezan a
 * aparecer rechazos de CV legítimos en el log, hay que saber qué marcador los
 * está disparando para poder sacarlo de la lista.
 */
export function detectActivePdfContent(buffer: Buffer): string | null {
    for (const marcador of MARCADORES) {
        let desde = 0;
        for (;;) {
            const posicion = buffer.indexOf(marcador, desde, 'latin1');
            if (posicion === -1) {
                break;
            }
            const siguiente = buffer[posicion + marcador.length];
            // Fin del archivo o delimitador válido: es un nombre de objeto PDF
            // de verdad, no una coincidencia dentro de datos binarios.
            if (siguiente === undefined || DELIMITADORES.has(siguiente)) {
                return marcador;
            }
            desde = posicion + 1;
        }
    }
    return null;
}
