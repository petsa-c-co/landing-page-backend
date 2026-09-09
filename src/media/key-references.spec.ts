import * as fs from 'fs';
import * as path from 'path';
import {
    COLUMNAS_SIN_ARCHIVO,
    KEY_REFERENCES,
} from './media-references.service';

/**
 * La red que hace que olvidarse falle ruidosamente.
 *
 * KEY_REFERENCES es el único lugar donde está escrito quién usa qué archivo, y
 * de él dependen las dos operaciones que borran del disco: la limpieza al
 * reemplazar una imagen y el borrado manual desde el panel.
 *
 * Si alguien agrega una entidad con una imagen y no la suma al registro, el
 * fallo no es que quede basura: es que el sistema deja de VER esa referencia y
 * borra un archivo QUE SE ESTÁ USANDO. La imagen desaparece del sitio y el
 * único rastro es una línea en el log.
 *
 * Mismo mecanismo que audited-entities.spec.ts usa para el registro de cambios.
 */
describe('registro de archivos en uso', () => {
    // Los nombres que en este proyecto significan "acá hay un archivo".
    const PARECE_ARCHIVO =
        /^ {4}([a-zA-Z]*(?:[Ii]mage|[Ll]ogo|[Pp]df|[Cc]over|[Mm]edia|[Pp]hoto|[Aa]vatar|[Ff]ile)[a-zA-Z]*)[!?]?:\s/gm;

    const columnasDeArchivoDelProyecto = (): string[] => {
        const encontradas: string[] = [];
        const recorrer = (dir: string): void => {
            for (const entrada of fs.readdirSync(dir, {
                withFileTypes: true,
            })) {
                const ruta = path.join(dir, entrada.name);
                if (entrada.isDirectory()) {
                    recorrer(ruta);
                    continue;
                }
                if (!entrada.name.endsWith('.entity.ts')) {
                    continue;
                }
                const fuente = fs.readFileSync(ruta, 'utf8');
                const clase = /^export class (\w+)/m.exec(fuente)?.[1];
                if (!clase) {
                    continue;
                }
                for (const m of fuente.matchAll(PARECE_ARCHIVO)) {
                    encontradas.push(`${clase}.${m[1]}`);
                }
            }
        };
        recorrer(path.join(process.cwd(), 'src'));
        return encontradas;
    };

    const declaradas = (): Set<string> => {
        const set = new Set<string>();
        for (const ref of KEY_REFERENCES) {
            const clase = (ref.entity as { name: string }).name;
            for (const columna of ref.columns) {
                set.add(`${clase}.${columna}`);
            }
        }
        return set;
    };

    it('toda columna de archivo está en el registro o excluida a propósito', () => {
        const registradas = declaradas();
        const sinClasificar = columnasDeArchivoDelProyecto()
            .filter((columna) => !registradas.has(columna))
            .filter((columna) => !COLUMNAS_SIN_ARCHIVO.has(columna))
            .sort();

        expect(sinClasificar).toEqual([]);
    });

    // Al revés: una columna que se renombró o se borró deja el registro
    // apuntando al vacío, y esa entidad pasa a ser invisible en la búsqueda.
    it('el registro no apunta a columnas que ya no existen', () => {
        const enElProyecto = new Set(columnasDeArchivoDelProyecto());
        const fantasmas = [...declaradas()]
            .filter((columna) => !enElProyecto.has(columna))
            .sort();

        expect(fantasmas).toEqual([]);
    });

    it('cada exclusión dice por qué', () => {
        const sinMotivo = [...COLUMNAS_SIN_ARCHIVO.entries()]
            .filter(([, motivo]) => motivo.trim().length < 20)
            .map(([columna]) => columna);

        expect(sinMotivo).toEqual([]);
    });

    it('ninguna columna está en las dos listas', () => {
        const registradas = declaradas();
        const enLasDos = [...COLUMNAS_SIN_ARCHIVO.keys()].filter((columna) =>
            registradas.has(columna),
        );

        expect(enLasDos).toEqual([]);
    });
});
