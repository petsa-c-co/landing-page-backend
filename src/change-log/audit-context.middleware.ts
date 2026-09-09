import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { auditContext } from './audit-context';
import { User } from '@/users/entities/user.entity';

/**
 * Abre el contexto de auditoría al principio de cada request.
 *
 * TIENE que ser un middleware y no un interceptor, y el motivo no es evidente:
 * un interceptor DEVUELVE el Observable, y Nest se suscribe a él FUERA del
 * callback de AsyncLocalStorage.run(). Para cuando el handler corre, el
 * contexto ya se perdió y todos los cambios quedarían registrados como
 * "sistema" —sin ningún error, sin ningún síntoma—. Con middleware, next() se
 * invoca ADENTRO del contexto y toda la cadena (guards, pipes, handler,
 * subscribers) lo hereda.
 *
 * El usuario NO se lee acá: se pasa una función que lo lee más tarde. Este
 * middleware corre antes que el guard de JWT, así que en este punto `req.user`
 * todavía no existe. Al momento del flush, sí.
 */
@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void {
        auditContext.run(() => req.user as User | undefined, () => next());
    }
}
