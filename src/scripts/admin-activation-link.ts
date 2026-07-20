/* eslint-disable no-console -- script de terminal: imprimir el enlace es su propósito */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { VerificationTokenService } from '../auth/services/verification-token.service';
import { VerificationTokenType } from '../auth/entities/verification-token.entity';

/**
 * Red de seguridad de bootstrap/ops: genera e imprime en la terminal un enlace
 * de activación fresco para una cuenta PENDIENTE (por si el correo falló o el
 * token expiró). Solo funciona con cuentas que aún no se activaron.
 *
 * Uso: pnpm admin:link <email>
 */
async function main(): Promise<void> {
    const rawEmail = process.argv[2];
    if (!rawEmail) {
        console.error('Uso: pnpm admin:link <email>');
        process.exitCode = 1;
        return;
    }
    const email = rawEmail.trim().toLowerCase();

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });
    try {
        const usersService = app.get(UsersService);
        const verificationTokenService = app.get(VerificationTokenService);
        const configService = app.get(ConfigService);

        const user = await usersService.findOneByEmail(email);
        if (!user) {
            console.error(`No existe ningún usuario con el email ${email}.`);
            process.exitCode = 1;
            return;
        }
        if (user.isActive) {
            console.error('La cuenta ya está activada; no se genera enlace.');
            process.exitCode = 1;
            return;
        }

        await verificationTokenService.revokeAllByUser(
            user,
            VerificationTokenType.ACCOUNT_ACTIVATION,
        );
        const token = await verificationTokenService.create(
            user,
            VerificationTokenType.ACCOUNT_ACTIVATION,
        );
        const base = (
            configService.get<string>('FRONTEND_URL') ?? ''
        ).replace(/\/+$/, '');

        console.log('\nEnlace de activación generado:\n');
        console.log(`  ${base}/activate?token=${token.token}\n`);
    } finally {
        await app.close();
    }
}

void main();
