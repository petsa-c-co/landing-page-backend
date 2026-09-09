// Cómo debe renderizar el frontend la lista de items de un servicio.
// Corresponde a los 3 layouts reales del sitio:
//  - bullets: lista simple (Operación y Mantenimiento)
//  - icons: items con ícono (Transporte de Personal: pickup/combi/minibus)
//  - numbered: items numerados con spec (Well Testing: equipo + presión)
export enum ServiceItemsLayout {
    BULLETS = 'bullets',
    ICONS = 'icons',
    NUMBERED = 'numbered',
}
