// Un posteo tal como lo devuelve una fuente de LinkedIn, ya normalizado a lo
// que necesita la bandeja de curaduría (independiente del formato crudo de la
// API de LinkedIn).
export interface FetchedLinkedInPost {
    // URN único del post en LinkedIn; clave de deduplicación.
    externalId: string;
    // Permalink al post original.
    url: string;
    // Texto del posteo.
    text: string;
    // URL de la imagen asociada (si tiene). Puede ser una URL http o un data:
    // URI (lo usa el stub de desarrollo). Se descarga al almacenamiento al aprobar.
    mediaUrl: string | null;
    // Nombre de la organización/autor.
    authorName: string | null;
    // Fecha de publicación en LinkedIn.
    postedAt: Date | null;
}

/**
 * Puerto de entrada de posteos de LinkedIn. Se inyecta por el token
 * LINKEDIN_SOURCE; el módulo elige la implementación real (API) o el stub de
 * desarrollo según LINKEDIN_FETCH_MODE. Así toda la lógica de curaduría es
 * testeable sin depender del acceso real a LinkedIn.
 */
export interface LinkedInSource {
    fetchRecentPosts(): Promise<FetchedLinkedInPost[]>;
}

export const LINKEDIN_SOURCE = Symbol('LINKEDIN_SOURCE');
