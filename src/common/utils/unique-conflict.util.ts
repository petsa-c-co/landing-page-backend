import { ConflictException } from '@nestjs/common';

export type UniqueField = 'slug' | 'name';

/**
 * Quién retiene el valor único que provocó el 409. Va en el cuerpo de la
 * respuesta para que el panel pueda ofrecer la solución en el momento
 * (restaurar ese registro / eliminarlo definitivamente) sin tener que buscarlo.
 */
export interface UniqueConflictInfo {
    /** Id del registro que ya usa el valor. */
    id: string;
    field: UniqueField;
    value: string;
    /** true = el bloqueante está en la papelera (borrado, recuperable). */
    inTrash: boolean;
}

const fieldLabel = (field: UniqueField): string =>
    field === 'slug' ? 'el slug' : 'el nombre';

/**
 * 409 al crear/editar: el valor único ya está tomado. Si quien lo retiene está
 * en la papelera, el mensaje indica cómo liberarlo.
 * `label` es el sustantivo del recurso: 'un servicio', 'una nota', etc.
 */
export function uniqueConflictException(
    label: string,
    info: UniqueConflictInfo,
): ConflictException {
    const campo = fieldLabel(info.field);
    const message = info.inTrash
        ? `Ya existe ${label} con ${campo} «${info.value}» en la papelera. Restaurá ese registro o eliminalo definitivamente para liberar ${campo}.`
        : `Ya existe ${label} con ${campo} «${info.value}».`;
    return new ConflictException({ message, conflict: info });
}

/**
 * 409 al restaurar: otro registro FUERA de la papelera ya usa el valor único,
 * así que recuperarlo violaría el índice único. Defensivo: con el flujo normal
 * no debería ocurrir, porque un item en la papelera reserva su valor.
 */
export function restoreConflictException(
    label: string,
    info: UniqueConflictInfo,
): ConflictException {
    const campo = fieldLabel(info.field);
    const message =
        `No se puede restaurar: ya existe ${label} con ${campo} «${info.value}» fuera de la papelera. ` +
        `Cambiá ${campo} de ese registro, o eliminá definitivamente el de la papelera.`;
    return new ConflictException({ message, conflict: info });
}
