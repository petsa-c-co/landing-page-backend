/**
 * Orígenes que CORS acepta.
 *
 * El header `Origin` se compara de forma EXACTA: `http://localhost:5173` y
 * `http://192.168.80.185:5173` son orígenes distintos aunque sean la misma
 * aplicación. En desarrollo el panel se abre indistintamente por IP de red (para
 * probar desde el celular) o por localhost, así que aceptar uno solo deja al
 * otro sin poder llamar a la API.
 *
 * Las variantes locales se derivan del MISMO puerto de FRONTEND_URL en lugar de
 * fijarlo a mano, para que sigan funcionando si mañana Vite cambia de puerto.
 *
 * En producción NO se agrega nada: se acepta únicamente FRONTEND_URL.
 */
export function buildCorsOrigins(
    frontendUrl: string,
    isProduction: boolean,
): string[] {
    // El Origin nunca lleva barra final; el match es exacto.
    const base = (frontendUrl ?? '').replace(/\/+$/, '');

    if (isProduction || !base) {
        return base ? [base] : [];
    }

    const origenes = new Set<string>([base]);
    try {
        const { protocol, port } = new URL(base);
        const sufijo = port ? `:${port}` : '';
        origenes.add(`${protocol}//localhost${sufijo}`);
        origenes.add(`${protocol}//127.0.0.1${sufijo}`);
    } catch {
        // Joi ya valida que FRONTEND_URL sea una URI; si aun así no parsea, se
        // sigue con el valor tal cual en vez de romper el arranque.
    }
    return [...origenes];
}
