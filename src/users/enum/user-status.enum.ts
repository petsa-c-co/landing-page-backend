/**
 * Estado de una cuenta, tal como lo muestra el panel.
 *
 * NO es una columna: se deriva de `isActive` y de si el usuario llegó a definir
 * una contraseña. La razón es que `isActive = false` significa dos cosas muy
 * distintas —una invitación que nunca se aceptó y una cuenta dada de baja— y
 * quien administra necesita distinguirlas. Al derivarlo no puede quedar
 * desincronizado con los campos reales.
 */
export enum UserStatus {
    /** Invitado: tiene email y roles, pero todavía no definió su contraseña. */
    PENDIENTE = 'pendiente',
    /** Activo y con acceso al panel. */
    ACTIVO = 'activo',
    /** Activó su cuenta en su momento y un administrador le quitó el acceso. */
    DESACTIVADO = 'desactivado',
}
