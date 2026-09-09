/**
 * Imagen que viaja DENTRO del mensaje y se referencia desde el HTML con
 * `cid:<cid>`. Se usa para el banner: así se ve siempre, aunque el cliente
 * bloquee imágenes externas y sin depender de que el backend sea alcanzable
 * desde internet.
 */
export interface MailInlineImage {
    cid: string;
    filename: string;
    content: Buffer;
    contentType: string;
}

/** Un correo listo para enviar, independiente del proveedor. */
export interface OutgoingMail {
    to: string;
    subject: string;
    html: string;
    text?: string;
    /** Responder-a: se usa en la notificación de contacto para contestarle
     *  directo a quien escribió por el formulario. */
    replyTo?: string;
    /** Adelanto que muestran algunos clientes junto al asunto. */
    previewText?: string;
    /** Sobrescribe MAIL_FROM_NAME para este correo puntual. */
    fromName?: string;
    /** Imágenes embebidas, referenciadas en el HTML con `cid:`. */
    inlineImages?: MailInlineImage[];
    /**
     * Evita duplicados si un envío se reintenta. Solo la aplican los
     * proveedores que la soportan (Resend); los demás la ignoran.
     */
    idempotencyKey?: string;
}

/**
 * Puerto de salida de correo. Se inyecta por el token MAIL_PROVIDER; el módulo
 * elige la implementación según MAIL_PROVIDER (envialosimple | resend).
 *
 * CONTRATO: `send` NUNCA lanza. Devuelve false y loguea el detalle del fallo,
 * porque un problema del proveedor de correo no debe tumbar el request que lo
 * disparó (una invitación, un reset o un mensaje de contacto ya persistido).
 */
export interface MailProvider {
    /** Nombre para los logs, p. ej. 'EnvíaloSimple'. */
    readonly name: string;
    send(mail: OutgoingMail): Promise<boolean>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
