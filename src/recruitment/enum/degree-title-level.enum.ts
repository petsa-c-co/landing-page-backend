// Nivel educativo del título. Permite agrupar el autocompletado en el
// formulario y filtrar/reportar por nivel desde el panel de RRHH.
//
// Ordenados como escalera educativa. PRIMARIO y SECUNDARIO (común, no técnico)
// existen porque muchos puestos del rubro —Maestranza, Tareas Generales,
// Pañolero, Amolador— se cubren con gente sin título técnico: sin estos
// niveles, esas postulaciones quedaban con el campo vacío o en texto libre.
export enum DegreeTitleLevel {
    PRIMARIO = 'primario',
    SECUNDARIO = 'secundario',
    SECUNDARIO_TECNICO = 'secundario_tecnico',
    TERCIARIO = 'terciario',
    UNIVERSITARIO = 'universitario',
    FORMACION_PROFESIONAL = 'formacion_profesional',
}
