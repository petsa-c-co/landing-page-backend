import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { UserStatus } from '../enum/user-status.enum';

export class UserQueryDto extends PaginationQueryDto {
    /** Busca en nombre, apellido y email, ignorando mayúsculas y acentos. */
    @IsOptional()
    @IsString({ message: 'search debe ser texto' })
    @MaxLength(100, { message: 'search no puede superar los 100 caracteres' })
    search?: string;

    @IsOptional()
    @IsEnum(UserRoles, { message: 'El rol debe ser admin, rrhh o user' })
    role?: UserRoles;

    @IsOptional()
    @IsEnum(UserStatus, {
        message: 'El estado debe ser pendiente, activo o desactivado',
    })
    status?: UserStatus;
}
