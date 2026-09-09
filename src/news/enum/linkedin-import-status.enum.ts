// Estado de un posteo traído de LinkedIn dentro de la bandeja de curaduría.
//  - pending: esperando decisión de admin/rrhh.
//  - approved: ya se publicó como nota (no vuelve a la cola).
//  - rejected: descartado; se conserva SOLO para no reimportarlo en cada sync.
export enum LinkedInImportStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
}
