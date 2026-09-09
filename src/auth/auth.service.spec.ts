import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '@/users/users.service';
import { VerificationTokenService } from './services/verification-token.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { MailService } from '@/mail/mail.service';
import { User } from '@/users/entities/user.entity';
import { UserStatus } from '@/users/enum/user-status.enum';

// Se construye con `new User()` para conservar el getter `status`.
const makeUser = (over: Partial<User> = {}): User =>
    Object.assign(new User(), {
        id: 'u1',
        email: 'ana@x.com',
        name: 'Ana',
        surname: 'Pérez',
        password: 'hash',
        isActive: true,
        roles: [],
        ...over,
    });

const PENDIENTE = { isActive: false, password: null };
const DESACTIVADA = { isActive: false, password: 'hash' };

describe('AuthService (estados de cuenta)', () => {
    let service: AuthService;
    let users: { findOneById: jest.Mock; updatePassword: jest.Mock };
    let verificationTokens: {
        revokeAllByUser: jest.Mock;
        create: jest.Mock;
        validate: jest.Mock;
    };
    let refreshTokens: { revokeAllByUser: jest.Mock };
    let mail: { sendActivationEmail: jest.Mock };

    beforeEach(() => {
        users = {
            findOneById: jest.fn(),
            updatePassword: jest.fn().mockResolvedValue(undefined),
        };
        verificationTokens = {
            revokeAllByUser: jest.fn().mockResolvedValue(undefined),
            create: jest.fn().mockResolvedValue({ token: 'tok' }),
            validate: jest.fn(),
        };
        refreshTokens = { revokeAllByUser: jest.fn().mockResolvedValue(undefined) };
        mail = { sendActivationEmail: jest.fn().mockResolvedValue(true) };

        service = new AuthService(
            users as unknown as UsersService,
            {} as never, // JwtService: no interviene en estos caminos
            refreshTokens as unknown as RefreshTokenService,
            verificationTokens as unknown as VerificationTokenService,
            mail as unknown as MailService,
        );
    });

    describe('resendActivation', () => {
        it('reenvía a una invitación que nunca se aceptó', async () => {
            const user = makeUser(PENDIENTE);
            users.findOneById.mockResolvedValue(user);

            await service.resendActivation('u1');

            expect(user.status).toBe(UserStatus.PENDIENTE);
            expect(verificationTokens.create).toHaveBeenCalled();
        });

        it('rechaza una cuenta ya activada', async () => {
            users.findOneById.mockResolvedValue(makeUser({ isActive: true }));

            await expect(service.resendActivation('u1')).rejects.toThrow(
                BadRequestException,
            );
            expect(verificationTokens.create).not.toHaveBeenCalled();
        });

        /**
         * Una cuenta dada de baja también tiene isActive:false. Mirando solo ese
         * campo pasaba el filtro, recibía el correo de bienvenida y al activarse
         * —por un endpoint público— volvía a quedar habilitada, revirtiendo en
         * silencio la baja que hizo otro admin.
         */
        it('RECHAZA una cuenta dada de baja, y no le manda ningún correo', async () => {
            const user = makeUser(DESACTIVADA);
            users.findOneById.mockResolvedValue(user);

            await expect(service.resendActivation('u1')).rejects.toThrow(
                /dada de baja/,
            );
            expect(user.status).toBe(UserStatus.DESACTIVADO);
            expect(verificationTokens.create).not.toHaveBeenCalled();
            expect(mail.sendActivationEmail).not.toHaveBeenCalled();
        });
    });

    describe('resetPassword', () => {
        it('cambia la contraseña de una cuenta activa', async () => {
            verificationTokens.validate.mockResolvedValue({
                user: makeUser({ isActive: true }),
            });

            await service.resetPassword({
                token: 't',
                newPassword: 'NuevaClave123!',
            });

            expect(users.updatePassword).toHaveBeenCalled();
            expect(refreshTokens.revokeAllByUser).toHaveBeenCalled();
        });

        /**
         * forgotPassword solo emite el enlace para cuentas activas, pero la baja
         * puede ocurrir DESPUÉS de emitirlo y el enlace vive una hora. Sin este
         * chequeo, la cuenta quedaba con una contraseña elegida por su titular
         * después de la baja — la que valdría si algún día se la reactivara.
         */
        it('RECHAZA un enlace de una cuenta dada de baja', async () => {
            verificationTokens.validate.mockResolvedValue({
                user: makeUser(DESACTIVADA),
            });

            await expect(
                service.resetPassword({ token: 't', newPassword: 'X123456!' }),
            ).rejects.toThrow(BadRequestException);
            expect(users.updatePassword).not.toHaveBeenCalled();
        });

        it('el mensaje no revela el estado de la cuenta', async () => {
            verificationTokens.validate.mockResolvedValue({
                user: makeUser(DESACTIVADA),
            });

            await expect(
                service.resetPassword({ token: 't', newPassword: 'X123456!' }),
            ).rejects.toThrow(/El enlace ya no es válido/);
        });
    });
});
