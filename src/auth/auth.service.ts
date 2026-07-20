import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { User } from '@/users/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { UsersService } from '@/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { LoginResponse } from './interfaces/login.response';
import { PublicUser } from './interfaces/public-user.interface';
import { VerificationTokenService } from './services/verification-token.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { VerificationTokenType } from './entities/verification-token.entity';
import { MailService } from '@/mail/mail.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';

// Costo de bcrypt para el hashing de contraseñas (2^12 rondas).
const BCRYPT_ROUNDS = 12;

// Hash bcrypt (cost 12) precalculado de un valor descartable. Cuando el email
// no existe (o la cuenta aún no tiene contraseña) se compara contra este hash
// para que el tiempo de respuesta del login no revele si la cuenta está
// registrada (anti-enumeración por timing).
const DUMMY_PASSWORD_HASH =
    '$2b$12$qUqSRyk1EyNFAYfy5UQrquqlAIHr.DRGmy18vby9bh37/cn3UOCMK';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly refreshTokenService: RefreshTokenService,
        private readonly verificationTokenService: VerificationTokenService,
        private readonly mailService: MailService,
    ) {}

    private toPublicUser(user: User): PublicUser {
        return {
            id: user.id,
            email: user.email,
            // Un usuario que llega hasta aquí (login/refresh/activación) ya está
            // activado, por lo que name/surname no son null en la práctica.
            name: user.name ?? '',
            surname: user.surname ?? '',
        };
    }

    private sendActivationEmailInBackground(user: User, token: string): void {
        // Disparo en segundo plano: un fallo del proveedor de correo no debe
        // tumbar el request; el admin puede reenviar la invitación más tarde.
        this.mailService
            .sendActivationEmail(user.email, token)
            .catch((err: unknown) => {
                this.logger.error(
                    `Fallo al enviar correo de activación al usuario ${user.id}`,
                    err instanceof Error ? err.stack : String(err),
                );
            });
    }

    /**
     * Alta de un usuario por parte del admin. Crea la cuenta PENDIENTE (solo
     * email + roles) y le envía un enlace de activación para que defina su
     * nombre, apellido y contraseña.
     */
    async inviteUser(inviteDto: InviteUserDto): Promise<User> {
        const user = await this.usersService.createPendingUser(inviteDto);

        const activationToken = await this.verificationTokenService.create(
            user,
            VerificationTokenType.ACCOUNT_ACTIVATION,
        );

        this.sendActivationEmailInBackground(user, activationToken.token);

        return user;
    }

    async resendActivation(userId: string): Promise<void> {
        const user = await this.usersService.findOneById(userId);
        if (!user) {
            throw new NotFoundException('El usuario no existe');
        }
        if (user.isActive) {
            throw new BadRequestException('La cuenta ya está activada');
        }

        // Un solo token de activación vigente por usuario.
        await this.verificationTokenService.revokeAllByUser(
            user,
            VerificationTokenType.ACCOUNT_ACTIVATION,
        );
        const activationToken = await this.verificationTokenService.create(
            user,
            VerificationTokenType.ACCOUNT_ACTIVATION,
        );
        this.sendActivationEmailInBackground(user, activationToken.token);
    }

    async activateAccount(activateDto: ActivateAccountDto): Promise<void> {
        const activationToken = await this.verificationTokenService.validate(
            activateDto.token,
            VerificationTokenType.ACCOUNT_ACTIVATION,
        );
        const user = activationToken.user;

        const hashedPassword = await bcrypt.hash(
            activateDto.password,
            BCRYPT_ROUNDS,
        );
        await this.usersService.activateUser(user.id, {
            name: activateDto.name,
            surname: activateDto.surname,
            hashedPassword,
        });
    }

    async login(loginDto: LoginUserDto): Promise<LoginResponse> {
        const { email, password } = loginDto;
        const user = await this.usersService.findOneByEmail(email);

        // Se compara SIEMPRE contra un hash (real o dummy) para igualar el
        // tiempo de respuesta exista o no el usuario, o esté aún sin activar.
        const isPasswordValid = await bcrypt.compare(
            password,
            user?.password ?? DUMMY_PASSWORD_HASH,
        );

        if (!user || !isPasswordValid) {
            this.logger.warn(
                user
                    ? `Intento de login fallido para el usuario ${user.id}`
                    : 'Intento de login con un correo no registrado',
            );
            throw new UnauthorizedException(
                'El correo electrónico o la contraseña son incorrectos',
            );
        }
        if (!user.isActive) {
            throw new UnauthorizedException(
                'La cuenta aún no está activada. Revisa el correo de invitación.',
            );
        }
        const accessToken: string = await this.jwtService.signAsync({
            sub: user.id,
        });
        const refreshToken = await this.refreshTokenService.create(user);
        return {
            user: this.toPublicUser(user),
            tokens: {
                accessToken,
                refreshToken: refreshToken.token,
            },
        };
    }

    async logout(refreshToken: string): Promise<void> {
        await this.refreshTokenService.revoke(refreshToken);
    }

    async refresh(refreshToken: string): Promise<LoginResponse> {
        // 1. Validar y CONSUMIR el token viejo en un claim atómico (rotación
        //    con detección de reutilización; ver RefreshTokenService.consume).
        const oldToken = await this.refreshTokenService.consume(refreshToken);
        const user = oldToken.user;

        // 2. Generar un nuevo Access Token
        const accessToken = await this.jwtService.signAsync({ sub: user.id });

        // 3. Generar un nuevo Refresh Token
        const { token: newRefreshToken } =
            await this.refreshTokenService.create(user);

        // 4. Devolver la misma estructura que en el login
        return {
            user: this.toPublicUser(user),
            tokens: {
                accessToken,
                refreshToken: newRefreshToken,
            },
        };
    }

    async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<void> {
        const existingUser = await this.usersService.findOneByEmail(
            forgotPasswordDto.email,
        );
        // Respuesta idéntica exista o no el usuario (anti-enumeración). Solo se
        // envía el reset a cuentas ACTIVAS: una cuenta pendiente debe activarse
        // (con su enlace de invitación), no restablecer una contraseña que no
        // tiene.
        if (existingUser?.isActive) {
            const verificationToken =
                await this.verificationTokenService.create(
                    existingUser,
                    VerificationTokenType.PASSWORD_RESET,
                );
            this.mailService
                .sendPasswordResetEmail(
                    existingUser.email,
                    verificationToken.token,
                    existingUser.name ?? '',
                )
                .catch((err: unknown) => {
                    this.logger.error(
                        `Fallo al enviar correo de recuperación al usuario ${existingUser.id}`,
                        err instanceof Error ? err.stack : String(err),
                    );
                });
        }
    }

    async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
        const verificationToken = await this.verificationTokenService.validate(
            resetPasswordDto.token,
            VerificationTokenType.PASSWORD_RESET,
        );
        const user = verificationToken.user;
        const newPassword = await bcrypt.hash(
            resetPasswordDto.newPassword,
            BCRYPT_ROUNDS,
        );
        await this.usersService.updatePassword(user.id, newPassword);

        // Tras un cambio de contraseña, invalidar todas las sesiones activas y
        // los demás tokens de reset pendientes (defensa ante cuenta comprometida).
        await this.refreshTokenService.revokeAllByUser(user);
        await this.verificationTokenService.revokeAllByUser(
            user,
            VerificationTokenType.PASSWORD_RESET,
        );
    }
}
