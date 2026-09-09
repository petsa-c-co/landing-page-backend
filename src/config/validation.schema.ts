import * as Joi from 'joi';

export const validationSchema = Joi.object({
    // SIN valor por defecto, a propósito: si NODE_ENV faltara y cayera en
    // 'development', producción arrancaría con synchronize de TypeORM activo,
    // cookies sin Secure y Swagger expuesto, sin ningún error visible.
    NODE_ENV: Joi.string().valid('development', 'production').required(),
    PORT: Joi.number().default(3000),
    JWT_SECRET: Joi.string().min(32).required(),
    JWT_ACCESS_TOKEN_EXPIRES_IN: Joi.string().default('15m'),
    DATABASE_HOST: Joi.string().default('localhost'),
    DATABASE_PORT: Joi.number().required(),
    DATABASE_NAME: Joi.string().required(),
    DATABASE_USER: Joi.string().required(),
    DATABASE_PASSWORD: Joi.string().required(),
    VERIFICATION_TOKEN_EXPIRES_IN_HOURS: Joi.number().default(1),
    ACCOUNT_ACTIVATION_TOKEN_EXPIRES_IN_HOURS: Joi.number().default(48),
    REFRESH_TOKEN_EXPIRES_IN_DAYS: Joi.number().default(7),
    // ── Correo ────────────────────────────────────────────────────────────
    // Proveedor activo. La app arranca con el que se elija acá y exige SOLO
    // las credenciales de ese (ver los .when() de abajo): si falta la key del
    // proveedor elegido, el arranque falla con un mensaje claro en vez de
    // descubrirse cuando alguien no recibe su invitación.
    MAIL_PROVIDER: Joi.string()
        .valid('envialosimple', 'resend')
        .default('envialosimple'),
    // Remitente, común a ambos proveedores. Debe pertenecer a un dominio
    // verificado en el proveedor activo (si no, rechaza el envío).
    MAIL_FROM_EMAIL: Joi.string().email().required(),
    MAIL_FROM_NAME: Joi.string().default('Petrogassa'),
    // El banner de los correos NO se configura acá: viaja embebido dentro del
    // mensaje (src/mail/assets), así se ve siempre, aunque el cliente bloquee
    // imágenes externas y sin depender de que el backend sea público.
    // EnvíaloSimple Transaccional (DonWeb): la API key se genera por dominio
    // en Mis Dominios → Administración del dominio → API Key.
    ENVIALOSIMPLE_API_KEY: Joi.string().when('MAIL_PROVIDER', {
        is: 'envialosimple',
        then: Joi.required(),
        otherwise: Joi.optional().allow(''),
    }),
    ENVIALOSIMPLE_API_BASE_URL: Joi.string()
        .uri()
        .default('https://api.envialosimple.email/api/v1'),
    RESEND_API_KEY: Joi.string().when('MAIL_PROVIDER', {
        is: 'resend',
        then: Joi.required(),
        otherwise: Joi.optional().allow(''),
    }),
    // ── Integración con Gestión Petrogas ──────────────────────────────────
    // Las postulaciones del sitio se reenvían a la API de Gestión, servidor a
    // servidor. El token es un SECRETO y vive SOLO acá: nunca viaja al
    // frontend ni se commitea (los .env están en .gitignore).
    //
    // Requeridas: sin ellas la sección "Trabajá con nosotros" queda rota, y es
    // preferible que el arranque falle con un mensaje claro a descubrirlo
    // cuando un postulante no pueda enviar su CV.
    GESTION_API_BASE_URL: Joi.string().uri().required(),
    GESTION_API_TOKEN: Joi.string().min(10).required(),
    FRONTEND_URL: Joi.string().uri().required(),
    // Dominio público del sitio, SIN barra final. Es la base de las URLs del
    // sitemap; se configura por entorno porque en staging apunta a otro lado.
    // Es requerida a propósito: un sitemap con el dominio equivocado le da a
    // Google una lista de URLs que no existen, y eso es peor que no publicarlo.
    PUBLIC_SITE_URL: Joi.string().uri().required(),
    // Email del administrador inicial. Al arrancar, si no existe ningún admin,
    // se crea una cuenta pendiente con este email y se le envía la invitación.
    ADMIN_EMAIL: Joi.string().email().required(),
    // Almacenamiento de archivos en FILESYSTEM (montaje NFS en producción,
    // carpeta local en desarrollo). Debajo se crea UNA sola área:
    //   <STORAGE_PATH>/public   -> imágenes y PDFs del sitio, servidos por HTTP
    // No hay área privada: StorageService solo sabe escribir dentro de public/.
    // El usuario del contenedor debe tener permiso de escritura en esa ruta.
    STORAGE_PATH: Joi.string().default('./storage'),
    // Base de las URLs públicas de los archivos, SIN barra final: normalmente el
    // propio backend, que sirve la carpeta pública. Requerida a propósito y sin
    // default: un default de desarrollo dejaría a producción guardando URLs a
    // localhost dentro de las entidades, y eso se descubre recién cuando alguien
    // no ve las imágenes. Si mañana un nginx o un CDN sirven esa misma carpeta,
    // se apunta acá y no cambia el código.
    MEDIA_PUBLIC_BASE_URL: Joi.string().uri().required(),
    // Buzón de la empresa que recibe las notificaciones del form de contacto.
    CONTACT_INBOX_EMAIL: Joi.string().email().required(),
    // Integración con LinkedIn (importación de novedades a la cola de
    // curaduría). Todo opcional: la app arranca sin esto. 'stub' (por defecto)
    // usa posteos de ejemplo para desarrollo; 'api' usa la Community Management
    // API real, que requiere token + URN de la organización y que LinkedIn haya
    // aprobado el acceso al producto.
    LINKEDIN_FETCH_MODE: Joi.string().valid('api', 'stub').default('stub'),
    // En modo 'stub' se admite la clave presente y VACÍA: `optional()` habilita
    // que falte, no que esté vacía, y dotenv parsea `LINKEDIN_ACCESS_TOKEN=`
    // como cadena vacía. Sin eso, el .env.example —que las trae así— no arranca.
    //
    // En modo 'api' se exige contenido, no solo presencia. El `.allow('')` vive
    // únicamente en la rama `otherwise` a propósito: puesto en la base, gana
    // sobre el `required()` de la rama `then` —Joi corta la validación en cuanto
    // el valor está en la lista de permitidos— y el arranque aceptaba las dos
    // credenciales vacías con modo 'api'. El error aparecía recién en el primer
    // sync, que es justo lo que esto evita (mismo criterio que las claves de
    // correo).
    LINKEDIN_ORGANIZATION_URN: Joi.when('LINKEDIN_FETCH_MODE', {
        is: 'api',
        then: Joi.string().min(1).required(),
        otherwise: Joi.string().allow('').optional(),
    }),
    LINKEDIN_ACCESS_TOKEN: Joi.when('LINKEDIN_FETCH_MODE', {
        is: 'api',
        then: Joi.string().min(1).required(),
        otherwise: Joi.string().allow('').optional(),
    }),
    LINKEDIN_API_VERSION: Joi.string().default('202401'),
    LINKEDIN_API_BASE_URL: Joi.string()
        .uri()
        .default('https://api.linkedin.com'),
});
