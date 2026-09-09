import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_PROVIDER } from './providers/mail-provider.interface';
import type { MailProvider } from './providers/mail-provider.interface';
import { readFileSync } from 'fs';
import * as path from 'path';
import {
    BANNER_BIENVENIDA,
    BANNER_CONTACTO,
    BANNER_PASSWORD,
    InlineImage,
    renderMailLayout,
} from './mail-layout';
import { MailInlineImage } from './providers/mail-provider.interface';

// Escapa los caracteres con significado en HTML. Se aplica a todo valor
// controlado por el usuario (p. ej. su nombre) antes de interpolarlo en el
// cuerpo de un correo, para impedir inyección de HTML.
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Fecha en horario argentino (la empresa opera en Neuquén). Se calcula sobre un
// instante real y no sobre el `createdAt` de la base: esa columna es `timestamp`
// SIN zona horaria, y el driver la interpreta según la zona del proceso Node, lo
// que da una hora corrida cuando el contenedor no está en UTC. El correo se
// compone milisegundos después del alta, así que la diferencia es irrelevante.
function fechaArgentina(fecha: Date): string {
    return new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Argentina/Buenos_Aires',
    }).format(fecha);
}

/**
 * Correos transaccionales del backend. Arma el CONTENIDO (asunto, HTML,
 * enlaces) y delega el TRANSPORTE en el proveedor configurado
 * (MAIL_PROVIDER=envialosimple|resend), que se inyecta como puerto.
 *
 * Los tres métodos devuelven boolean y nunca lanzan: un fallo del proveedor no
 * debe tumbar el request que lo disparó.
 */
@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);

    constructor(
        @Inject(MAIL_PROVIDER)
        private readonly provider: MailProvider,
        private readonly configService: ConfigService,
    ) {
        this.logger.log(`Proveedor de correo activo: ${this.provider.name}`);
    }

    // Base para construir los enlaces de los correos. Sin barra final, para que
    // el resultado sea consistente aunque FRONTEND_URL termine en "/".
    private frontendBaseUrl(): string {
        const url = this.configService.get<string>('FRONTEND_URL') ?? '';
        return url.replace(/\/+$/, '');
    }

    // Los banners se leen una sola vez y quedan en memoria: son los mismos en
    // cada envío. __dirname resuelve tanto en dev (src/mail) como compilado
    // (dist/mail), porque nest-cli copia la carpeta assets.
    private readonly assetCache = new Map<string, Buffer>();

    /**
     * Carga el banner para adjuntarlo embebido. Si el archivo faltara (build
     * mal armado), devuelve undefined y el correo sale sin banner en vez de
     * fallar: es preferible una invitación sin imagen a una invitación que no
     * llega.
     */
    private inlineImage(image: InlineImage): MailInlineImage | undefined {
        try {
            let content = this.assetCache.get(image.asset);
            if (!content) {
                content = readFileSync(
                    path.join(__dirname, 'assets', image.asset),
                );
                this.assetCache.set(image.asset, content);
            }
            return {
                cid: image.cid,
                filename: image.filename,
                content,
                contentType: image.contentType,
            };
        } catch {
            this.logger.warn(
                `No se pudo leer el banner ${image.asset}; el correo sale sin imagen`,
            );
            return undefined;
        }
    }

    /**
     * Envía la invitación con el enlace de activación de cuenta. No lleva
     * nombre porque el usuario aún no lo definió (lo hace al activarse).
     */
    async sendActivationEmail(email: string, token: string): Promise<boolean> {
        // Página del frontend que toma el token y lo envía con
        // POST /api/auth/activate (misma convención que el reset).
        const activationLink = `${this.frontendBaseUrl()}/activate?token=${token}`;

        const horas =
            this.configService.get<number>(
                'ACCOUNT_ACTIVATION_TOKEN_EXPIRES_IN_HOURS',
            ) ?? 48;

        const banner = this.inlineImage(BANNER_BIENVENIDA);

        return this.provider.send({
            to: email,
            subject: 'Activá tu cuenta · Petrogas S.A.',
            previewText: 'Definí tu contraseña para acceder al panel',
            idempotencyKey: `activate-account/${token}`,
            inlineImages: banner ? [banner] : undefined,
            html: renderMailLayout({
                preheader: `Activá tu cuenta del panel de gestión de Petrogas S.A. — el enlace vence en ${horas} horas.`,
                banner: banner ? BANNER_BIENVENIDA : undefined,
                heading: 'Te damos la bienvenida',
                paragraphs: [
                    'Un administrador creó una cuenta para vos en el panel de gestión del sitio de <strong style="color:#24378f;">Petrogas S.A.</strong>',
                    'Para activarla solo tenés que definir tu nombre y una contraseña:',
                ],
                button: { label: 'Activar mi cuenta', url: activationLink },
                fallbackUrl: activationLink,
                notice: `Por seguridad, este enlace vence en <strong style="color:#24378f;">${horas} horas</strong> y puede usarse una sola vez. Si venció, pedile a un administrador que te reenvíe la invitación.`,
            }),
        });
    }

    /**
     * Notifica al buzón de la empresa (CONTACT_INBOX_EMAIL) un mensaje del
     * formulario de contacto. Todos los campos son controlados por el usuario:
     * se escapan SIEMPRE antes de interpolar en el HTML.
     */
    async sendContactNotification(contactMessage: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        subject: string | null;
        message: string;
    }): Promise<boolean> {
        const inbox = this.configService.get<string>('CONTACT_INBOX_EMAIL');
        if (!inbox) {
            this.logger.error(
                'CONTACT_INBOX_EMAIL no configurado; no se notifica el contacto',
            );
            return false;
        }

        const asunto = contactMessage.subject ?? 'Sin asunto';
        const safeName = escapeHtml(contactMessage.name);
        const safeEmail = escapeHtml(contactMessage.email);
        const safeSubject = escapeHtml(asunto);
        const safeMessage = escapeHtml(contactMessage.message).replace(
            /\n/g,
            '<br>',
        );
        // El teléfono es opcional: sin él no tiene sentido un enlace tel:.
        const filaTelefono = contactMessage.phone
            ? `<a href="tel:${encodeURIComponent(contactMessage.phone)}" style="color:#2c3143; text-decoration:none;">${escapeHtml(contactMessage.phone)}</a>`
            : '—';

        // Nombre acotado para el botón: el formulario admite hasta 100
        // caracteres y uno largo desarmaría el botón en el celular. Se recorta
        // ANTES de escapar: hacerlo después podría partir una entidad HTML
        // (`&gt;` cortado en `&gt`) y romper el texto del botón.
        const nombreBoton = escapeHtml(
            contactMessage.name.length > 28
                ? `${contactMessage.name.slice(0, 28)}…`
                : contactMessage.name,
        );
        const responderUrl = `mailto:${encodeURIComponent(contactMessage.email)}?subject=${encodeURIComponent(`Re: ${asunto}`)}`;

        const banner = this.inlineImage(BANNER_CONTACTO);

        return this.provider.send({
            to: inbox,
            fromName: 'Petrogassa Web',
            // Responder al correo va directo al remitente del formulario.
            replyTo: contactMessage.email,
            subject: `Nuevo mensaje de contacto: ${asunto}`,
            previewText: `${contactMessage.name} escribió desde el sitio`,
            idempotencyKey: `contact-message/${contactMessage.id}`,
            inlineImages: banner ? [banner] : undefined,
            html: renderMailLayout({
                preheader:
                    'Nuevo mensaje recibido desde el formulario de contacto del sitio web.',
                banner: banner ? BANNER_CONTACTO : undefined,
                heading: 'Nuevo mensaje de contacto',
                paragraphs: [
                    `Llegó un mensaje nuevo desde el <strong style="color:#24378f;">formulario de contacto</strong> del sitio web, el ${fechaArgentina(new Date())}.`,
                ],
                dataRows: [
                    {
                        label: 'Nombre',
                        value: `<strong style="color:#24378f;">${safeName}</strong>`,
                    },
                    {
                        label: 'Correo',
                        value: `<a href="mailto:${safeEmail}" style="color:#24378f; text-decoration:underline; word-break:break-all;">${safeEmail}</a>`,
                    },
                    { label: 'Teléfono', value: filaTelefono },
                    { label: 'Asunto', value: safeSubject },
                    { label: 'Mensaje', value: safeMessage, block: true },
                ],
                button: {
                    label: `Responder a ${nombreBoton}`,
                    url: responderUrl,
                },
                notice: 'El remitente cargó estos datos en el sitio; verificá el correo y el teléfono antes de compartir información sensible.',
                replyNote:
                    'Notificación automática del formulario de contacto de petrogassa.com. Podés responder directamente a este correo o usar el botón: en los dos casos la respuesta le llega a quien escribió.',
            }),
        });
    }

    async sendPasswordResetEmail(
        email: string,
        token: string,
        name: string,
    ): Promise<boolean> {
        const safeName = escapeHtml(name);
        // URL del frontend que mostrará el formulario para nueva contraseña
        const resetLink = `${this.frontendBaseUrl()}/reset-password?token=${token}`;

        const horas =
            this.configService.get<number>(
                'VERIFICATION_TOKEN_EXPIRES_IN_HOURS',
            ) ?? 1;
        const vencimiento = horas === 1 ? '1 hora' : `${horas} horas`;

        const banner = this.inlineImage(BANNER_PASSWORD);

        return this.provider.send({
            to: email,
            subject: 'Restablecé tu contraseña - Petrogas S.A.',
            previewText: 'Enlace para crear una contraseña nueva',
            idempotencyKey: `reset-password/${token}`,
            inlineImages: banner ? [banner] : undefined,
            html: renderMailLayout({
                preheader: `Pediste restablecer tu contraseña del panel de gestión. El enlace vence en ${vencimiento}.`,
                banner: banner ? BANNER_PASSWORD : undefined,
                heading: 'Restablecé tu contraseña',
                paragraphs: [
                    `Hola${safeName ? ` <strong style="color:#24378f;">${safeName}</strong>` : ''}, recibimos un pedido para restablecer la contraseña de tu cuenta en el panel de gestión de <strong style="color:#24378f;">Petrogas S.A.</strong>`,
                    'Para elegir una contraseña nueva, entrá desde acá:',
                ],
                button: { label: 'Elegir contraseña nueva', url: resetLink },
                fallbackUrl: resetLink,
                notice: `Por seguridad, este enlace vence en <strong style="color:#24378f;">${vencimiento}</strong> y puede usarse una sola vez. <strong style="color:#24378f;">Si no pediste este cambio</strong>, ignorá este correo: tu contraseña actual sigue funcionando.`,
            }),
        });
    }
}
