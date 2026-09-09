import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailProvider, OutgoingMail } from './mail-provider.interface';

// Respuesta de éxito de la API: POST /mail/send -> { queued, id }.
interface SendSuccess {
    queued?: boolean;
    id?: string;
}

/**
 * EnvíaloSimple Transaccional (DonWeb) vía su API HTTP.
 *
 * NO se usa el SDK oficial (@envialosimple/transaccional) a propósito: su capa
 * HTTP envuelve todo en un try/catch y, como axios ya lanza con cualquier 4xx,
 * convierte TODOS los errores en "Unable to contact API server" — se pierden el
 * status y el mensaje real de la API (dominio no verificado, API key inválida,
 * límite horario). Acá se lee el cuerpo del error y se loguea, que es lo que
 * permite diagnosticar en producción. De paso, evita sumar axios: el proyecto
 * ya usa fetch nativo (ver LinkedInApiSource).
 *
 * Limitaciones del servicio a tener en cuenta: no admite CC/BCC, hasta 20
 * destinatarios en `to`, HTML máx 2 MB, y no ofrece claves de idempotencia.
 */
export class EnvialoSimpleProvider implements MailProvider {
    readonly name = 'EnvíaloSimple';
    private readonly logger = new Logger(EnvialoSimpleProvider.name);

    constructor(private readonly config: ConfigService) {}

    async send(mail: OutgoingMail): Promise<boolean> {
        const apiKey = this.config.get<string>('ENVIALOSIMPLE_API_KEY');
        if (!apiKey) {
            this.logger.error(
                'ENVIALOSIMPLE_API_KEY no configurada; no se envía el correo',
            );
            return false;
        }

        const baseUrl = (
            this.config.get<string>('ENVIALOSIMPLE_API_BASE_URL') ??
            'https://api.envialosimple.email/api/v1'
        ).replace(/\/+$/, '');

        try {
            const res = await fetch(`${baseUrl}/mail/send`, {
                // Mismo criterio que GestionClient. Importa especialmente en el
                // PRIMER arranque: AdminSeedService espera este envío dentro de
                // onApplicationBootstrap, que Nest corre ANTES de abrir el
                // puerto, así que un proveedor colgado deja el contenedor sin
                // responder hasta el techo de undici (~5 min) y el healthcheck
                // lo marca unhealthy.
                signal: AbortSignal.timeout(30_000),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(this.toPayload(mail)),
            });

            if (!res.ok) {
                // El cuerpo trae el motivo real; sin esto un 403 por dominio
                // sin verificar es indistinguible de una key vencida.
                const detail = await res.text().catch(() => '');
                this.logger.error(
                    `EnvíaloSimple rechazó el envío a ${mail.to}: HTTP ${res.status} ${detail.slice(0, 300)}`,
                );
                return false;
            }

            const data = (await res.json().catch(() => ({}))) as SendSuccess;
            this.logger.log(
                `Correo encolado en EnvíaloSimple para ${mail.to}. ID: ${data.id ?? '(sin id)'}`,
            );
            return true;
        } catch (err) {
            // Solo llega acá por fallos de red/DNS: el HTTP con error ya se
            // manejó arriba con su detalle.
            this.logger.error(
                `No se pudo contactar a EnvíaloSimple para enviar a ${mail.to}`,
                err instanceof Error ? err.stack : String(err),
            );
            return false;
        }
    }

    private toPayload(mail: OutgoingMail): Record<string, unknown> {
        const fromEmail = this.config.get<string>('MAIL_FROM_EMAIL') ?? '';
        const fromName =
            mail.fromName ??
            this.config.get<string>('MAIL_FROM_NAME') ??
            'Petrogassa';

        // Nombres de campo en snake_case, como los espera la API.
        const payload: Record<string, unknown> = {
            from: { email: fromEmail, name: fromName },
            to: mail.to,
            subject: mail.subject,
            html: mail.html,
        };
        if (mail.text) {
            payload.text = mail.text;
        }
        if (mail.replyTo) {
            payload.reply_to = mail.replyTo;
        }
        if (mail.previewText) {
            payload.preview_text = mail.previewText;
        }
        if (mail.inlineImages?.length) {
            // La API espera el contenido en base64. `disposition: inline` + el
            // `id` (que es el Content-ID) hacen que el HTML pueda referenciarla
            // con cid:<id> en vez de mostrarla como adjunto.
            payload.attachments = mail.inlineImages.map((img) => ({
                id: img.cid,
                filename: img.filename,
                disposition: 'inline',
                content: img.content.toString('base64'),
            }));
        }
        return payload;
    }
}
