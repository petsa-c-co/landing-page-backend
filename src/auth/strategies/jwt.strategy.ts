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

        // Un access token emitido ANTES de que se invalidaran las sesiones deja
        // de ser válido, aunque todavía no haya vencido. Esto cierra la ventana
        // del JWT stateless en dos casos: un cambio de contraseña y un cierre de
        // sesiones hecho por un administrador. Vale el más reciente de los dos.
        // La comparación es en segundos, la granularidad del claim iat.
        const invalidatedAt = [user.passwordChangedAt, user.sessionsRevokedAt]
            .filter((fecha): fecha is Date => fecha instanceof Date)
            .reduce<Date | null>(
                (ultima, fecha) =>
                    !ultima || fecha > ultima ? fecha : ultima,
                null,
            );

        // `iat` viene en segundos, así que se lo lleva a milisegundos —el inicio
        // de ese segundo— antes de comparar. Truncar el corte en vez de expandir
        // el iat dejaba pasar los tokens emitidos dentro del MISMO segundo que
        // la invalidación, que es justo el caso de un cierre de sesiones.
        //
        // Queda un margen de 1 segundo inherente a la resolución del claim: un
        // token emitido en el mismo segundo del corte se rechaza aunque sea
        // posterior. En la práctica solo afecta a quien vuelve a iniciar sesión
        // en ese mismo segundo; reintentar alcanza.
        if (invalidatedAt && typeof iat === 'number') {
            if (iat * 1000 < invalidatedAt.getTime()) {
                throw new UnauthorizedException(
                    'La sesión ya no es válida, por favor inicia sesión nuevamente',
                );
            }
        }

        return user;
    }
}
