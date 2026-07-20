import { createHash, randomBytes } from 'crypto';

/**
 * Genera un token opaco de alta entropía (256 bits) en hexadecimal.
 * Se usa como valor "crudo" que viaja al cliente (cookie / enlace de correo).
 */
export function generateOpaqueToken(): string {
    return randomBytes(32).toString('hex');
}

/**
 * Devuelve el hash SHA-256 (hex) de un token. Solo el hash se persiste en la
 * base de datos; el valor crudo nunca se almacena. Así, un volcado de la DB no
 * permite reutilizar refresh tokens ni tokens de restablecimiento.
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
