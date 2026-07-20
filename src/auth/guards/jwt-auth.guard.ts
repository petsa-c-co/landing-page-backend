import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT propio. El AuthGuard('jwt') de Passport responde con el mensaje
 * genérico "Unauthorized" (en inglés) cuando falta el token. Aquí se
 * sobreescribe handleRequest para devolver un mensaje en español coherente con
 * el resto de la API, preservando los errores específicos que ya lanza
 * JwtStrategy.validate (usuario inactivo, sesión inválida tras cambio de clave).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    handleRequest<TUser>(err: unknown, user: TUser): TUser {
        if (err || !user) {
            throw (
                (err as Error | null) ??
                new UnauthorizedException(
                    'No autenticado. Inicia sesión para continuar.',
                )
            );
        }
        return user;
    }
}
