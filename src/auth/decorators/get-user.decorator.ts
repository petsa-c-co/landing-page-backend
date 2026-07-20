import {
    createParamDecorator,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { User } from '@/users/entities/user.entity';

export const GetUser = createParamDecorator(
    (data: keyof User | undefined, ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest<{ user: User | undefined }>();
        const user: User | undefined = req.user;

        // Solo ocurre si el decorador se usa sin @Auth(); se responde 401 con
        // el mismo mensaje que UserRoleGuard para mantener la coherencia.
        if (!user) {
            throw new UnauthorizedException(
                'Usuario no autenticado en la solicitud',
            );
        }

        return data ? user[data] : user;
    },
);
