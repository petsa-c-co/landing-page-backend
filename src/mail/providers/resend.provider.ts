import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { MailProvider, OutgoingMail } from './mail-provider.interface';

/**
 * Resend. Se mantiene como alternativa seleccionable (MAIL_PROVIDER=resend);
 * es el único de los dos que soporta claves de idempotencia, así que un envío
 * reintentado con la misma clave no duplica el correo.
 */
export class ResendProvider implements MailProvider {
    readonly name = 'Resend';
    private readonly logger = new Logger(ResendProvider.name);
    private readonly resend: Resend;

    constructor(private readonly config: ConfigService) {
        this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    }

    async send(mail: OutgoingMail): Promise<boolean> {
        const fromEmail = this.config.get<string>('MAIL_FROM_EMAIL');
        const fromName =
            mail.fromName ??
            this.config.get<string>('MAIL_FROM_NAME') ??
            'Petrogassa';

        const { data, error } = await this.resend.emails.send(
            {
                from: `${fromName} <${fromEmail}>`,
                to: [mail.to],
                subject: mail.subject,
                html: mail.html,
                ...(mail.text ? { text: mail.text } : {}),
                ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
                // `contentId` es lo que convierte el adjunto en imagen EMBEBIDA:
                // sin él, Resend lo manda como archivo suelto y el banner
                // referenciado con cid: no se ve en el cuerpo. El SDK lo
                // soporta desde hace varias versiones (ver Attachment en sus
                // tipos); el comentario anterior acá decía que no, y quedó
                // viejo. `contentType` es opcional —lo deducen del filename—
                // pero mandarlo evita depender de la extensión del nombre.
                ...(mail.inlineImages?.length
                    ? {
                          attachments: mail.inlineImages.map((img) => ({
                              filename: img.filename,
                              content: img.content,
                              contentId: img.cid,
                              contentType: img.contentType,
                          })),
                      }
                    : {}),
            },
            mail.idempotencyKey
                ? { idempotencyKey: mail.idempotencyKey }
                : undefined,
        );

        if (error) {
            this.logger.error(
                `Resend rechazó el envío a ${mail.to}: ${error.name} - ${error.message}`,
            );
            return false;
        }

        this.logger.log(`Correo enviado con Resend a ${mail.to}. ID: ${data?.id}`);
        return true;
    }
}
