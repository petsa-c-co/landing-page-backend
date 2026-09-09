/**
 * Roles del panel.
 *
 * La columna `users.roles` es `text[]`, NO un enum de Postgres (ver la
 * migración InitialSchema), así que agregar un rol acá no necesita migración.
 */
export enum UserRoles {
    USER = 'user',
    ADMIN = 'admin',
    // Recursos Humanos: gestiona postulaciones/CVs, perfiles de puesto y
    // novedades/prensa (además de subir imágenes de contenido).
    RRHH = 'rrhh',
    /**
     * Auditor: mantiene todo lo que tiene que ver con las certificaciones —las
     * normas ISO del listado, la marca de Bureau Veritas del pie y su texto de
     * alcance— y nada más.
     *
     * No toca usuarios, mensajes, novedades, servicios, clientes, títulos ni
     * los banners del sitio.
     */
    AUDITOR = 'auditor',
}
