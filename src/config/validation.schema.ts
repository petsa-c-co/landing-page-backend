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
    RESEND_API_KEY: Joi.string().required(),
    RESEND_FROM_EMAIL: Joi.string().required(),
    FRONTEND_URL: Joi.string().uri().required(),
    // Email del administrador inicial. Al arrancar, si no existe ningún admin,
    // se crea una cuenta pendiente con este email y se le envía la invitación.
    ADMIN_EMAIL: Joi.string().email().required(),
});
