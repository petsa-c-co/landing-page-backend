import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/users/users.service';
import { MailService } from '@/mail/mail.service';
import { VerificationTokenService } from './verification-token.service';
import { VerificationTokenType } from '../entities/verification-token.entity';
import { UserRoles } from '../enum/user-roles.enum';

/**
 * Al arrancar, si no existe ningún administrador, crea uno PENDIENTE a partir
 * de ADMIN_EMAIL y le envía el enlace de activación (mismo flujo de invitación
 * que el resto de usuarios). Ninguna contraseña vive en variables de entorno:
 * el admin define nombre, apellido y contraseña al activar su cuenta.
 * Idempotente: si ya hay un admin, no hace nada.
 */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
    private readonly logger = new Logger(AdminSeedService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly usersService: UsersService,
        private readonly verificationTokenService: VerificationTokenService,
        private readonly mailService: MailService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const email = this.configService.get<string>('ADMIN_EMAIL');
        if (!email) {
            // Joi lo exige, pero por robustez no asumimos que esté presente.
            this.logger.warn('ADMIN_EMAIL no definido; se omite el seed.');
            return;
        }

        if (await this.usersService.existsAdmin()) {
            return;
        }

        // Si el email ya pertenece a un usuario (no admin), no forzamos nada:
        // requiere intervención manual del operador.
        const existing = await this.usersService.findOneByEmail(email);
        if (existing) {
            this.logger.warn(
                `No hay admin, pero el email ${email} ya está en uso por otro usuario. Resolvé manualmente (promover ese usuario o cambiar ADMIN_EMAIL).`,
            );
            return;
        }

        const admin = await this.usersService.createPendingUser({
            email,
            roles: [UserRoles.ADMIN],
        });
        const activationToken = await this.verificationTokenService.create(
            admin,
            VerificationTokenType.ACCOUNT_ACTIVATION,
        );

        const sent = await this.mailService.sendActivationEmail(
            email,
            activationToken.token,
        );
        if (sent) {
            this.logger.log(
                `Admin inicial sembrado (pendiente). Invitación enviada a ${email}.`,
            );
        } else {
            this.logger.warn(
                `Admin inicial sembrado (pendiente), pero falló el envío del correo. Genera el enlace de activación con: pnpm admin:link ${email}`,
            );
        }
    }
}
