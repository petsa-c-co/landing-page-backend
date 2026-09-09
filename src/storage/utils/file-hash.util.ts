import { createHash } from 'crypto';

/**
 * Huella SHA-256 (hex) del contenido de un archivo. Se usa para detectar que
 * un CV reenviado es EXACTAMENTE el mismo que el guardado y así evitar volver
 * a subirlo (y borrar el anterior).
 *
 * Ojo: cualquier cambio, por mínimo que sea, produce un hash distinto. Sirve
 * para ahorrar operaciones sobre archivos idénticos, no para "parecidos".
 */
export function sha256Hex(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}
