import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    ParseUUIDPipe,
    Res,
    Req,
    UnauthorizedException,
} from '@nestjs/common';
import type { CookieOptions, Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { LoginResponse } from './interfaces/login.response';
import { PublicUser } from './interfaces/public-user.interface';
import { User } from '@/users/entities/user.entity';
import { Throttle } from '@nestjs/throttler';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ConfigService } from '@nestjs/config';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { Auth } from './decorators/auth.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { UserRoles } from './enum/user-roles.enum';

// El refresh token solo se necesita en los endpoints de auth, así que se limita
// su alcance con este path (no viaja en cada request de la app).
const REFRESH_COOKIE_PATH = '/api/auth';

// Límite estricto para los endpoints sensibles de autenticación.
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
    ) {}

    // Función auxiliar para parsear tiempos como "15m", "1h", "7d" a milisegundos
    private parseTimeToMs(timeStr: string): number {
        const value = parseInt(timeStr.slice(0, -1), 10);
        const unit = timeStr.slice(-1).toLowerCase();

        switch (unit) {
            case 's':
                return value * 1000;
            case 'm':
                return value * 60 * 1000;
            case 'h':
                return value * 60 * 60 * 1000;
            case 'd':
                return value * 24 * 60 * 60 * 1000;
            default:
                return 15 * 60 * 1000; // Default 15m si falla
        }
    }

    private readRefreshCookie(req: Request): string | undefined {
        const cookies = req.cookies as
            | Record<string, string | undefined>
            | undefined;
        return cookies?.refreshToken;
    }

    private baseCookieOptions(): CookieOptions {
        return {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
        };
    }

    private setAuthCookies(
        res: Response,
        tokens: LoginResponse['tokens'],
    ): void {
        const refreshDays = this.configService.get<number>(
            'REFRESH_TOKEN_EXPIRES_IN_DAYS',
            7,
        );
        const refreshMaxAge = refreshDays * 24 * 60 * 60 * 1000;

        const accessExpString = this.configService.get<string>(
            'JWT_ACCESS_TOKEN_EXPIRES_IN',
            '15m',
        );
        const accessMaxAge = this.parseTimeToMs(accessExpString);

        res.cookie('refreshToken', tokens.refreshToken, {
            ...this.baseCookieOptions(),
            path: REFRESH_COOKIE_PATH,
            maxAge: refreshMaxAge,
        });

        res.cookie('accessToken', tokens.accessToken, {
            ...this.baseCookieOptions(),
            path: '/',
            maxAge: accessMaxAge,
        });
    }

    private clearAuthCookies(res: Response): void {
        // clearCookie debe recibir las mismas opciones (path, sameSite, secure)
        // con las que se creó la cookie, o el navegador no la borra.
        res.clearCookie('accessToken', {
            ...this.baseCookieOptions(),
            path: '/',
        });
        res.clearCookie('refreshToken', {
            ...this.baseCookieOptions(),
            path: REFRESH_COOKIE_PATH,
        });
    }

    // Alta de usuarios (solo admin): crea la cuenta pendiente y dispara el
    // correo de invitación. El admin puede asignar rol admin en el DTO.
    @Post('users')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage(
        'Usuario invitado. Se le envió un correo para activar su cuenta.',
    )
    inviteUser(@Body() inviteUserDto: InviteUserDto): Promise<User> {
        return this.authService.inviteUser(inviteUserDto);
    }

    // Reenvío de la invitación (solo admin), por si el enlace expiró.
    @Post('users/:id/resend-activation')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Invitación reenviada correctamente')
    resendActivation(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.authService.resendActivation(id);
    }

    // Activación pública: el invitado define nombre, apellido y contraseña con
    // el token recibido por correo.
    @Post('activate')
    @ResponseMessage('Cuenta activada correctamente. Ya puedes iniciar sesión.')
    activate(@Body() activateAccountDto: ActivateAccountDto): Promise<void> {
        return this.authService.activateAccount(activateAccountDto);
    }

    @Post('login')
    @ResponseMessage('Inicio de sesión exitoso')
    async login(
        @Body() loginUserDto: LoginUserDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<PublicUser> {
        const { user, tokens } = await this.authService.login(loginUserDto);
        this.setAuthCookies(res, tokens);
        return user;
    }

    /**
     * Usuario de la sesión actual, con sus roles.
     *
     * Es lo que permite al panel decidir qué mostrar tras recargar la página:
     * las cookies son httpOnly, así que el frontend no puede leer el token ni
     * deducir el rol por su cuenta, y `login` no vuelve a ejecutarse.
     *
     * Se responde con la entidad, que el serializador global limpia de campos
     * sensibles (contraseña), igual que `GET /users/:id`.
     */
    @Get('me')
    @Auth()
    @ResponseMessage('Sesión obtenida correctamente')
    me(@GetUser() user: User): User {
        return user;
    }

    @Post('refresh')
    @ResponseMessage('Sesión renovada correctamente')
    async refresh(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<void> {
        const refreshToken = this.readRefreshCookie(req);

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token no proporcionado');
        }

        const { tokens } = await this.authService.refresh(refreshToken);
        this.setAuthCookies(res, tokens);
    }

    @Post('logout')
    @ResponseMessage('Sesión cerrada correctamente')
    async logout(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<void> {
        const refreshToken = this.readRefreshCookie(req);

        if (refreshToken) {
            await this.authService.logout(refreshToken);
        }

        this.clearAuthCookies(res);
    }

    @Post('forgot-password')
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @ResponseMessage(
        'Si el correo electrónico está registrado, te enviaremos un correo con instrucciones para restablecer tu contraseña',
    )
    forgotPassword(
        @Body() forgotPasswordDto: ForgotPasswordDto,
    ): Promise<void> {
        return this.authService.forgotPassword(forgotPasswordDto);
    }

    @Post('reset-password')
    @ResponseMessage('Contraseña restablecida correctamente')
    resetPassword(@Body() resetPasswordDto: ResetPasswordDto): Promise<void> {
        return this.authService.resetPassword(resetPasswordDto);
    }
}
