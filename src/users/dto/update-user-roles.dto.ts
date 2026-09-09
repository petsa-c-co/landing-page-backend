import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { UserRoles } from '@/auth/enum/user-roles.enum';

export class UpdateUserRolesDto {
    /**
     * Reemplaza el conjunto completo de roles (no es un alta parcial). Se envía
     * al menos uno: una cuenta sin roles no podría hacer nada.
     */
    @IsArray({ message: 'roles debe ser un arreglo' })
    @ArrayNotEmpty({ message: 'Debe indicar al menos un rol' })
    @IsEnum(UserRoles, {
        each: true,
        message: 'Cada rol debe ser admin, rrhh o user',
    })
    roles: UserRoles[];
}
