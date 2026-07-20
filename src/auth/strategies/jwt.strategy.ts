import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { User } from '@/users/entities/user.entity';
import { UsersService } from '@/users/users.service';
import type { Request } from 'express';
import { JWT_AUDIENCE, JWT_ISSUER } from '../auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private readonly usersService: UsersService,
        configService: ConfigService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (request: Request): string | null => {
                    const cookies = request?.cookies as
                        | Record<string, string | undefined>
                        | undefined;
                    return cookies?.accessToken ?? null;
                },
                ExtractJwt.fromAuthHeaderAsBearerToken(),
            ]),
            secretOrKey: configService.get('JWT_SECRET')!,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });
    }

    async validate(payload: JwtPayload): Promise<User> {
        const { sub, iat } = payload;
        const user = await this.usersService.findOneById(sub);

        if (!user) {
            throw new UnauthorizedException('Token no válido');
        }

        if (!user.isActive) {
            throw new UnauthorizedException(
                'El usuario está inactivo hable con el administrador',
            );
        }

        // Un access token emitido ANTES del último cambio de contraseña deja
        // de ser válido (cierra la ventana post-reset del JWT stateless). La
        // comparación es en segundos, la granularidad del claim iat.
        if (user.passwordChangedAt && typeof iat === 'number') {
            const changedAtSeconds = Math.floor(
                user.passwordChangedAt.getTime() / 1000,
            );
            if (iat < changedAtSeconds) {
                throw new UnauthorizedException(
                    'La sesión ya no es válida, por favor inicia sesión nuevamente',
                );
            }
        }

        return user;
    }
}
