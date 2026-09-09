import * as fs from 'fs';
import * as path from 'path';
import { ENTIDADES_AUDITADAS, NO_AUDITADAS } from './audited-entities';

/**
 * La red que hace que olvidarse falle ruidosamente.
 *
 * El fallo que este test previene es invisible: alguien agrega una entidad de
 * contenido, no la suma al registro, y sus cambios simplemente no se auditan.
 * Nada se rompe, nadie se entera, y el día que el auditor pregunta no hay
 * rastro. Es el mismo mecanismo que openapi.spec.ts usa para las rutas.
 */
describe('registro de entidades auditadas', () => {
    const clasesEnElProyecto = (): string[] => {
        const nombres: string[] = [];
        const recorrer = (dir: string): void => {
            for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
                const ruta = path.join(dir, entrada.name);
                if (entrada.isDirectory()) {
                    recorrer(ruta);
                } else if (entrada.name.endsWith('.entity.ts')) {
                    const fuente = fs.readFileSync(ruta, 'utf8');
                    for (const m of fuente.matchAll(
                        /^export class (\w+)/gm,
                    )) {
                        nombres.push(m[1]);
                    }
                }
            }
        };
        recorrer(path.join(process.cwd(), 'src'));
        return nombres;
    };

    it('toda entidad del proyecto está clasificada', () => {
        const auditadas = new Set(
            [...ENTIDADES_AUDITADAS.keys()].map((clase) => clase.name),
        );
        const sinClasificar = clasesEnElProyecto()
            .filter((nombre) => !auditadas.has(nombre))
            .filter((nombre) => !NO_AUDITADAS.has(nombre))
            .sort();

        expect(sinClasificar).toEqual([]);
    });

    it('cada entidad excluida dice por qué', () => {
        const sinMotivo = [...NO_AUDITADAS.entries()]
            .filter(([, motivo]) => motivo.trim().length < 20)
            .map(([nombre]) => nombre);

        expect(sinMotivo).toEqual([]);
    });

    it('ninguna entidad está en las dos listas', () => {
        const enLasDos = [...ENTIDADES_AUDITADAS.keys()]
            .map((clase) => clase.name)
            .filter((nombre) => NO_AUDITADAS.has(nombre));

        expect(enLasDos).toEqual([]);
    });

    /**
     * Un campo que existe en la entidad y no está en el registro cambia sin
     * dejar rastro. Se listan las excepciones a propósito: los timestamps y las
     * relaciones no son "cambios" que un auditor quiera ver.
     */
    it('cada entidad auditada declara todos sus campos de contenido', () => {
        const IGNORADOS = new Set([
            'id',
            'createdAt',
            'updatedAt',
            'deletedAt',
            'items',
            'source',
        ]);
        const faltantes: string[] = [];

        for (const [clase, config] of ENTIDADES_AUDITADAS) {
            const archivo = path.join(
                process.cwd(),
                'src',
                ...rutaDeEntidad(clase.name),
            );
            if (!fs.existsSync(archivo)) {
                continue;
            }
            const fuente = fs.readFileSync(archivo, 'utf8');
            for (const m of fuente.matchAll(/^ {4}(\w+)[!?]?:\s/gm)) {
                const campo = m[1];
                if (IGNORADOS.has(campo) || campo in config.campos) {
                    continue;
                }
                faltantes.push(`${clase.name}.${campo}`);
            }
        }

        expect(faltantes).toEqual([]);
    });
});

/** src/<modulo>/entities/<kebab>.entity.ts, resuelto por búsqueda. */
function rutaDeEntidad(clase: string): string[] {
    const kebab = clase
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
    const base = path.join(process.cwd(), 'src');
    let encontrado: string[] = [];
    const buscar = (dir: string, relativo: string[]): void => {
        for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entrada.isDirectory()) {
                buscar(path.join(dir, entrada.name), [
                    ...relativo,
                    entrada.name,
                ]);
            } else if (entrada.name === `${kebab}.entity.ts`) {
                encontrado = [...relativo, entrada.name];
            }
        }
    };
    buscar(base, []);
    return encontrado;
}
