import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { META_ROLES } from '../decorators/roles-protected.decorator';
import { User } from '@/users/entities/user.entity';
import { UserRoles } from '../enum/user-roles.enum';

@Injectable()
export class UserRoleGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(
        context: ExecutionContext,
    ): boolean | Promise<boolean> | Observable<boolean> {
        const validRoles: UserRoles[] = this.reflector.getAllAndOverride(
            META_ROLES,
            [
                context.getHandler(), // Método (prioridad)
                context.getClass(), // Controlador (fallback)
            ],
        );
        //si no se pasan parametros por el decorador significa que no son necesarios permisos
        if (!validRoles || validRoles.length === 0) {
            return true;
        }

        //obtener el usuario de la request
        const req = context.switchToHttp().getRequest<{ user?: User }>();
        const user = req.user;

        if (!user) {
            throw new UnauthorizedException(
                'Usuario no autenticado en la solicitud',
            );
        }

        //verificar si el usuario tiene algunos de los permisos requeridos
        for (const role of user.roles) {
            if (validRoles.includes(role)) {
                return true;
            }
        }
        //si no tiene ningun permiso retorna esto
        throw new ForbiddenException(
            `No tienes permisos suficientes para realizar esta acción`,
        );
    }
}
