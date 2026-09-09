import {
    ChangeLogDetail,
    ValueKind,
} from './entities/change-log-detail.entity';
import { EntidadAuditada, TipoDeCampo } from './audited-entities';

/** Un detalle todavía sin asiento al que colgarse. */
export type DetalleSuelto = Omit<ChangeLogDetail, 'id' | 'entry' | 'entryId'>;

/** Campos que nunca son un "cambio" que un auditor quiera ver. */
const IGNORADOS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt']);

/** Cómo se lee un valor en el registro. */
export function comoTexto(valor: unknown): string | null {
    if (valor === null || valor === undefined || valor === '') {
        return null;
    }
    if (typeof valor === 'boolean') {
        return valor ? 'Sí' : 'No';
    }
    if (valor instanceof Date) {
        return valor.toISOString().slice(0, 10);
    }
    if (
        typeof valor === 'string' ||
        typeof valor === 'number' ||
        typeof valor === 'bigint'
    ) {
        return String(valor);
    }
    // Un objeto acá sería un campo mal declarado en el registro; mejor dejar
    // constancia que escribir "[object Object]" en una auditoría.
    return JSON.stringify(valor);
}

/** Solo el nombre del archivo: la ruta completa no le dice nada a nadie. */
function nombreDeArchivo(key: unknown): string | null {
    const texto = comoTexto(key);
    return texto ? (texto.split('/').pop() ?? texto) : null;
}

function detalle(
    campo: string,
    tipo: TipoDeCampo,
    antes: unknown,
    despues: unknown,
): DetalleSuelto {
    if (tipo.modo === 'archivo') {
        const habia = antes !== null && antes !== undefined && antes !== '';
        const hay = despues !== null && despues !== undefined && despues !== '';
        return {
            field: campo,
            fieldLabel: tipo.etiqueta,
            previousValue: nombreDeArchivo(antes),
            newValue: nombreDeArchivo(despues),
            summary: !habia
                ? `Se cargó ${tipo.etiqueta.toLowerCase()}`
                : !hay
                  ? `Se quitó ${tipo.etiqueta.toLowerCase()}`
                  : `Se reemplazó ${tipo.etiqueta.toLowerCase()}`,
            valueKind: ValueKind.ARCHIVO,
        };
    }

    if (tipo.modo === 'resumen') {
        // A propósito sin valores: el cuerpo de una nota admite 100.000
        // caracteres y volcarlo en cada edición inflaría el registro y haría
        // inmanejable el Excel.
        return {
            field: campo,
            fieldLabel: tipo.etiqueta,
            previousValue: null,
            newValue: null,
            summary: tipo.texto,
            valueKind: ValueKind.TEXTO,
        };
    }

    return {
        field: campo,
        fieldLabel: tipo.etiqueta,
        previousValue: comoTexto(antes),
        newValue: comoTexto(despues),
        summary: null,
        valueKind: tipo.clase ?? ValueKind.TEXTO,
    };
}

/**
 * Compara el estado previo contra el nuevo y devuelve un detalle por campo que
 * cambió de verdad.
 *
 * Función pura: es el corazón del registro y así se puede probar sin base.
 */
export function diffDeCampos(
    config: EntidadAuditada,
    antes: Record<string, unknown> | undefined,
    despues: Record<string, unknown>,
): DetalleSuelto[] {
    const detalles: DetalleSuelto[] = [];

    for (const [campo, tipo] of Object.entries(config.campos)) {
        if (IGNORADOS.has(campo)) {
            continue;
        }
        const valorAntes = antes?.[campo];
        const valorDespues = despues[campo];

        // En un alta no hay "antes": se listan los campos que vienen con algo.
        if (!antes) {
            if (
                valorDespues !== null &&
                valorDespues !== undefined &&
                valorDespues !== ''
            ) {
                detalles.push(detalle(campo, tipo, undefined, valorDespues));
            }
            continue;
        }

        if (comoTexto(valorAntes) !== comoTexto(valorDespues)) {
            detalles.push(detalle(campo, tipo, valorAntes, valorDespues));
        }
    }

    return detalles;
}

/**
 * Compara las listas de ítems de un servicio.
 *
 * Va aparte porque TypeORM los reconstruye enteros en cada edición: los borra
 * todos y los reinserta, aunque la lista sea idéntica. Comparar las listas ya
 * ordenadas es lo que evita que cada edición de un servicio ensucie el registro
 * con una decena de cambios que no ocurrieron.
 */
export function diffDeItems(
    antes: readonly string[],
    despues: readonly string[],
): DetalleSuelto | null {
    if (antes.join('|') === despues.join('|')) {
        return null;
    }
    return {
        field: 'items',
        fieldLabel: 'Ítems',
        previousValue: antes.length ? antes.join(', ') : null,
        newValue: despues.length ? despues.join(', ') : null,
        summary: null,
        valueKind: ValueKind.LISTA,
    };
}
