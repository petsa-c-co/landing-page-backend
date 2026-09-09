import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yamljs';

/**
 * openapi.yaml no es solo documentación: en desarrollo `main.ts` lo carga para
 * montar Swagger, y lo hace con **yamljs**. Si el archivo está malformado, el
 * arranque falla — y al no ser un fallo de compilación, se descubre recién al
 * levantar la app.
 *
 * Estos tests existen por errores reales que ya ocurrieron editando el archivo:
 *
 *  1. Un valor con coma dentro de un mapa en línea rompía yamljs pero pasaba
 *     por js-yaml. Por eso se valida con el MISMO parser que usa la app.
 *  2. Editando con scripts se borraron líneas de bloques vecinos: el YAML
 *     seguía siendo válido (una clave sin valor lo es) pero la documentación
 *     quedaba incompleta o le faltaba una ruta entera. De ahí los dos chequeos
 *     estructurales de abajo.
 */
describe('openapi.yaml', () => {
    // Los tests corren con rootDir=src, pero el archivo vive en la raíz.
    const archivo = path.join(process.cwd(), 'openapi.yaml');
    const doc = yaml.load(archivo) as {
        openapi?: string;
        paths?: Record<string, Record<string, { responses?: unknown }>>;
        components?: { schemas?: Record<string, unknown> };
    };

    it('lo parsea el mismo parser que usa main.ts (yamljs)', () => {
        expect(() => {
            yaml.load(archivo);
        }).not.toThrow();
    });

    it('expone un documento OpenAPI con rutas', () => {
        expect(doc.openapi).toMatch(/^3\./);
        expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(0);
    });

    it('toda operación declara al menos una respuesta', () => {
        const incompletas: string[] = [];
        for (const [ruta, ops] of Object.entries(doc.paths ?? {})) {
            for (const [metodo, op] of Object.entries(ops)) {
                const respuestas = op?.responses as
                    | Record<string, unknown>
                    | undefined;
                if (!respuestas || Object.keys(respuestas).length === 0) {
                    incompletas.push(`${metodo.toUpperCase()} ${ruta}`);
                }
            }
        }
        expect(incompletas).toEqual([]);
    });

    it('ningún $ref apunta a un schema inexistente', () => {
        const texto = fs.readFileSync(archivo, 'utf8');
        const definidos = new Set(
            Object.keys(doc.components?.schemas ?? {}),
        );
        const rotas = [
            ...new Set(
                [
                    ...texto.matchAll(
                        /#\/components\/schemas\/([A-Za-z0-9_]+)/g,
                    ),
                ].map((m) => m[1]),
            ),
        ].filter((nombre) => !definidos.has(nombre));

        expect(rotas).toEqual([]);
    });

    /**
     * El chequeo que habría atrapado los tres errores: que cada ruta declarada
     * en un controller esté documentada. Se lee el código fuente en lugar de
     * levantar Nest, para que el test siga siendo rápido.
     */
    it('documenta todas las rutas que exponen los controllers', () => {
        const enCodigo = new Set<string>();
        const recorrer = (dir: string): void => {
            for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
                const ruta = path.join(dir, entrada.name);
                if (entrada.isDirectory()) {
                    recorrer(ruta);
                } else if (entrada.name.endsWith('.controller.ts')) {
                    const fuente = fs.readFileSync(ruta, 'utf8');
                    const base = /@Controller\(\s*'([^']*)'/.exec(fuente);
                    const prefijo = base ? base[1] : '';
                    const metodos =
                        /@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g;
                    let m: RegExpExecArray | null;
                    while ((m = metodos.exec(fuente))) {
                        const sub = m[2] ?? '';
                        // El sitemap vive fuera del prefijo /api (ver main.ts).
                        const camino =
                            sub === 'sitemap.xml'
                                ? '/sitemap.xml'
                                : '/' +
                                  [prefijo, sub].filter(Boolean).join('/');
                        enCodigo.add(
                            `${m[1].toLowerCase()} ${camino.replace(
                                /:([a-zA-Z]+)/g,
                                '{$1}',
                            )}`,
                        );
                    }
                }
            }
        };
        recorrer(path.join(process.cwd(), 'src'));

        const documentadas = new Set<string>();
        for (const [ruta, ops] of Object.entries(doc.paths ?? {})) {
            for (const metodo of Object.keys(ops)) {
                documentadas.add(`${metodo} ${ruta}`);
            }
        }

        // El endpoint raíz es un "servicio operativo" sin contrato que documentar.
        const sinDocumentar = [...enCodigo]
            .filter((r) => r !== 'get /')
            .filter((r) => !documentadas.has(r))
            .sort();

        expect(sinDocumentar).toEqual([]);
    });
});
