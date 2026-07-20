/**
 * Proyección segura del usuario para respuestas de la API. Nunca incluye
 * password, roles, flags de estado (isActive/isEmailVerified) ni timestamps.
 */
export interface PublicUser {
    id: string;
    email: string;
    name: string;
    surname: string;
}
