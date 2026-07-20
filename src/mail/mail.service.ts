import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

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

@Injectable()
export class MailService {
    private readonly resend: Resend;
    private readonly logger = new Logger(MailService.name);

    constructor(private readonly configService: ConfigService) {
        // Obtenemos la API Key desde el ConfigService (validado por Joi)
        const apiKey = this.configService.get<string>('RESEND_API_KEY');
        this.resend = new Resend(apiKey);
    }

    // Base para construir los enlaces de los correos. Sin barra final, para que
    // el resultado sea consistente aunque FRONTEND_URL termine en "/".
    private frontendBaseUrl(): string {
        const url = this.configService.get<string>('FRONTEND_URL') ?? '';
        return url.replace(/\/+$/, '');
    }

    /**
     * Envía la invitación con el enlace de activación de cuenta. No lleva
     * nombre porque el usuario aún no lo definió (lo hace al activarse).
     */
    async sendActivationEmail(email: string, token: string): Promise<boolean> {
        // En desarrollo/plan gratuito de Resend, el "from" debe ser un dominio
        // verificado o el correo de prueba por defecto.
        const fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL');

        // Página del frontend que toma el token y lo envía con
        // POST /api/auth/activate (misma convención que el reset).
        const activationLink = `${this.frontendBaseUrl()}/activate?token=${token}`;

        const { data, error } = await this.resend.emails.send(
            {
                from: `Petrogassa <${fromEmail}>`,
                to: [email], // Array requerido por la documentación
                subject: 'Te invitaron a Petrogassa - Activa tu cuenta',
                html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>¡Bienvenido/a a Petrogassa!</h2>
                    <p>Se creó una cuenta para vos. Para activarla, hacé clic en el botón y definí tu nombre y contraseña:</p>
                    <a href="${activationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
                        Activar mi cuenta
                    </a>
                    <p style="margin-top: 20px; font-size: 12px; color: #666;">
                        Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                        ${activationLink}
                    </p>
                </div>
            `,
            },
            {
                idempotencyKey: `activate-account/${token}`,
            },
        );

        if (error) {
            this.logger.error(
                `Fallo al enviar correo de activación a ${email}: ${error.name} - ${error.message}`,
            );
            return false;
        }

        this.logger.log(
            `Correo de activación enviado a ${email}. ID: ${data?.id}`,
        );
        return true;
    }

    async sendPasswordResetEmail(
        email: string,
        token: string,
        name: string,
    ): Promise<boolean> {
        const fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL');
        const safeName = escapeHtml(name);

        // URL de tu frontend que mostrará el formulario para nueva contraseña
        const resetLink = `${this.frontendBaseUrl()}/reset-password?token=${token}`;

        const { data, error } = await this.resend.emails.send(
            {
                from: `Petrogassa <${fromEmail}>`,
                to: [email],
                subject: 'Restablece tu contraseña - Petrogassa',
                html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>¡Hola ${safeName}!</h2>
                    <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
                    <p>Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace expirará pronto.</p>
                    <a href="${resetLink}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
                        Restablecer Contraseña
                    </a>
                    <p style="margin-top: 20px; font-size: 12px; color: #666;">
                        Si tú no solicitaste este cambio, puedes ignorar este correo de forma segura.<br>
                        Si el botón no funciona, copia y pega este enlace:<br>
                        ${resetLink}
                    </p>
                </div>
            `,
            },
            {
                idempotencyKey: `reset-password/${token}`,
            },
        );

        if (error) {
            this.logger.error(
                `Fallo al enviar correo de recuperación a ${email}: ${error.name} - ${error.message}`,
            );
            return false;
        }

        this.logger.log(
            `Correo de recuperación enviado a ${email}. ID: ${data?.id}`,
        );
        return true;
    }
}
