import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { AsientoDeCambio } from './change-log.service';

/** Cómo se lee cada acción en la planilla. */
const ACCIONES: Record<string, string> = {
    creacion: 'Alta',
    modificacion: 'Modificación',
    baja: 'Baja (papelera)',
    restauracion: 'Restauración',
    eliminacion: 'Eliminación definitiva',
};

/** Cómo se lee cada tipo de contenido. */
const SECCIONES: Record<string, string> = {
    servicio: 'Servicios',
    certificacion: 'Certificaciones',
    cliente: 'Clientes',
    novedad: 'Novedades y Prensa',
    titulo: 'Títulos académicos',
    configuracion: 'Sitio',
    'imagen-del-sitio': 'Sitio',
};

/** Excel corta la celda ahí; se trunca a propósito y con marca. */
const MAX_CELDA = 32_000;

@Injectable()
export class ChangeLogExportService {
    /**
     * Arma la planilla del registro de cambios.
     *
     * Una fila por CAMPO cambiado, no por asiento: es lo que un auditor
     * necesita para seguir un valor a lo largo del tiempo. Los asientos sin
     * detalle (una baja, una restauración) igual llevan su fila.
     */
    async build(asientos: AsientoDeCambio[]): Promise<Buffer> {
        const libro = new ExcelJS.Workbook();
        libro.creator = 'Petrogas S.A.';
        libro.created = new Date();

        const hoja = libro.addWorksheet('Registro de cambios', {
            views: [{ state: 'frozen', ySplit: 1 }],
        });

        hoja.columns = [
            { header: 'Revisión', key: 'revision', width: 10 },
            { header: 'Fecha', key: 'fecha', width: 18 },
            { header: 'Sección', key: 'seccion', width: 22 },
            { header: 'Elemento', key: 'elemento', width: 32 },
            { header: 'Acción', key: 'accion', width: 22 },
            { header: 'Campo', key: 'campo', width: 24 },
            { header: 'Valor anterior', key: 'antes', width: 40 },
            { header: 'Valor nuevo', key: 'despues', width: 40 },
            { header: 'Usuario', key: 'usuario', width: 34 },
        ];

        hoja.getRow(1).font = { bold: true };
        hoja.autoFilter = { from: 'A1', to: 'I1' };

        for (const a of asientos) {
            const base = {
                revision: a.revision,
                fecha: formatearFecha(a.occurredAt),
                seccion: SECCIONES[a.entityType] ?? a.entityType,
                elemento: a.entityLabel,
                accion: ACCIONES[a.action] ?? a.action,
                usuario: a.actorLabel,
            };

            if (!a.details.length) {
                hoja.addRow({ ...base, campo: '', antes: '', despues: '' });
                continue;
            }

            for (const d of a.details) {
                hoja.addRow({
                    ...base,
                    campo: d.fieldLabel,
                    // Cuando hay resumen no hay valores: pasa con los campos
                    // largos y con los archivos.
                    antes: d.summary ? '' : celda(d.previousValue),
                    despues: d.summary
                        ? celda(d.summary)
                        : celda(d.newValue),
                });
            }
        }

        hoja.getColumn('antes').alignment = { wrapText: true, vertical: 'top' };
        hoja.getColumn('despues').alignment = { wrapText: true, vertical: 'top' };

        const bytes = await libro.xlsx.writeBuffer();
        return Buffer.from(bytes);
    }
}

function formatearFecha(fecha: Date): string {
    return new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(fecha);
}

/**
 * Prepara un valor para una celda.
 *
 * Los valores los escribió una persona en el panel, así que uno que empiece con
 * `=`, `+`, `-` o `@` lo interpretaría Excel como fórmula. Se le antepone un
 * apóstrofe para que se lea como texto: es inyección de fórmulas, y el archivo
 * lo va a abrir alguien de la empresa.
 */
function celda(valor: string | null): string {
    if (!valor) {
        return '';
    }
    const recortado =
        valor.length > MAX_CELDA
            ? `${valor.slice(0, MAX_CELDA)}… (texto recortado)`
            : valor;

    return /^[=+\-@]/.test(recortado) ? `'${recortado}` : recortado;
}
