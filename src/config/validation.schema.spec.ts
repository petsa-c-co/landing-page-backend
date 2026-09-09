import * as fs from 'fs';
import * as path from 'path';
import { validationSchema } from './validation.schema';

// Configuración mínima que la app exige para arrancar.
const BASE = {
    NODE_ENV: 'development',
    JWT_SECRET: 'clave-de-prueba-con-mas-de-32-caracteres-ok',
    DATABASE_PORT: 5432,
    DATABASE_NAME: 'db',
    DATABASE_USER: 'user',
    DATABASE_PASSWORD: 'pass',
    MAIL_FROM_EMAIL: 'no-reply@example.com',
    // El proveedor por defecto es envialosimple y exige su API key.
    ENVIALOSIMPLE_API_KEY: 'key-de-prueba',
    GESTION_API_BASE_URL: 'https://gestion.example.com/api/v1',
    GESTION_API_TOKEN: 'token-de-prueba-largo',
    FRONTEND_URL: 'http://localhost:5173',
    PUBLIC_SITE_URL: 'https://example.com',
    ADMIN_EMAIL: 'admin@example.com',
    MEDIA_PUBLIC_BASE_URL: 'http://localhost:3000',
    CONTACT_INBOX_EMAIL: 'inbox@example.com',
};

const validar = (extra: Record<string, unknown> = {}): string | undefined =>
    validationSchema.validate({ ...BASE, ...extra }, { allowUnknown: true })
        .error?.message;

describe('validationSchema', () => {
    it('la configuración mínima es válida', () => {
        expect(validar()).toBeUndefined();
    });

    describe('LinkedIn', () => {
        /**
         * `.optional()` habilita que la clave FALTE, no que esté presente y
         * vacía — y dotenv parsea `LINKEDIN_ACCESS_TOKEN=` como cadena vacía.
         * Sin `.allow('')`, el .env.example (que las trae así, documentadas como
         * opcionales) impedía arrancar la app.
         */
        it('acepta las credenciales VACÍAS, como vienen en .env.example', () => {
            expect(
                validar({
                    LINKEDIN_ORGANIZATION_URN: '',
                    LINKEDIN_ACCESS_TOKEN: '',
                }),
            ).toBeUndefined();
        });

        it('acepta que no estén', () => {
            expect(validar()).toBeUndefined();
        });

        /**
         * Este test pasaba sin probar lo que decía. Mandaba una sola variable
         * vacía y omitía la otra, así que el error que capturaba era el de la
         * AUSENTE: la vacía se colaba igual, porque el `.allow('')` de la base
         * ganaba sobre el `required()` de la rama. Ahora se mandan las dos
         * presentes y vacías, que es como las trae un .env real.
         */
        it('en modo api exige CONTENIDO, no solo que la clave esté', () => {
            const error = validar({
                LINKEDIN_FETCH_MODE: 'api',
                LINKEDIN_ORGANIZATION_URN: '',
                LINKEDIN_ACCESS_TOKEN: '',
            });

            expect(error).toMatch(/LINKEDIN/);
        });

        it('en modo api, con credenciales de verdad, valida', () => {
            expect(
                validar({
                    LINKEDIN_FETCH_MODE: 'api',
                    LINKEDIN_ORGANIZATION_URN: 'urn:li:organization:123',
                    LINKEDIN_ACCESS_TOKEN: 'token-de-linkedin',
                }),
            ).toBeUndefined();
        });

        it('en modo api, una credencial ausente también corta', () => {
            expect(
                validar({
                    LINKEDIN_FETCH_MODE: 'api',
                    LINKEDIN_ORGANIZATION_URN: 'urn:li:organization:123',
                }),
            ).toMatch(/LINKEDIN_ACCESS_TOKEN/);
        });

        it('en modo api con credenciales completas es válido', () => {
            expect(
                validar({
                    LINKEDIN_FETCH_MODE: 'api',
                    LINKEDIN_ORGANIZATION_URN: 'urn:li:organization:123',
                    LINKEDIN_ACCESS_TOKEN: 'token-real',
                }),
            ).toBeUndefined();
        });
    });

    /**
     * .env.example es el punto de partida de cualquier despliegue nuevo y del
     * onboarding. Si el schema exige una variable que el ejemplo no menciona, la
     * app no arranca y hay que descubrirlo leyendo el mensaje de Joi; si el
     * ejemplo trae variables que ya nadie lee, se arrastran configuraciones
     * fantasma de una etapa anterior. Las dos cosas pasaron de verdad.
     */
    describe('.env.example está sincronizado con el schema', () => {
        const claves = (
            validationSchema.describe() as {
                keys: Record<string, { flags?: { presence?: string } }>;
            }
        ).keys;
        const enSchema = Object.keys(claves);
        const ejemplo = fs.readFileSync(
            path.join(process.cwd(), '.env.example'),
            'utf8',
        );
        const enEjemplo = [...ejemplo.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
            (m) => m[1],
        );
        // Variables que solo lee docker compose: nunca llegan a Joi, así que
        // no pueden estar en el schema (ver docker-compose*.yml).
        const SOLO_COMPOSE = [
            'PROJECT_NAME',
            'HOST_PORT',
            'HOST_STORAGE_PATH',
            'DATABASE_HOST_PORT',
        ];

        it('documenta todas las variables que el schema conoce', () => {
            expect(enSchema.filter((k) => !enEjemplo.includes(k))).toEqual([]);
        });

        it('no arrastra variables que ya no lee nadie', () => {
            expect(
                enEjemplo.filter(
                    (k) => !enSchema.includes(k) && !SOLO_COMPOSE.includes(k),
                ),
            ).toEqual([]);
        });
    });

    it('sin NODE_ENV falla: en producción arrancaría con synchronize activo', () => {
        const sinNodeEnv: Record<string, unknown> = { ...BASE };
        delete sinNodeEnv.NODE_ENV;

        expect(
            validationSchema.validate(sinNodeEnv, { allowUnknown: true }).error
                ?.message,
        ).toMatch(/NODE_ENV/);
    });
});
