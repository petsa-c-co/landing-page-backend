import { Transform } from 'class-transformer';
import {
    IsArray,
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { UserRoles } from '../enum/user-roles.enum';

// Datos que el admin provee al invitar a un usuario. NO incluye contraseña ni
// nombre/apellido: esos los define el propio usuario al activar su cuenta.
export class InviteUserDto {
    @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
    @IsString({ message: 'El correo electrónico debe ser una cadena de texto' })
    @IsEmail({}, { message: 'El correo electrónico debe ser válido' })
    @MaxLength(254, {
        message: 'El correo electrónico no puede tener más de 254 caracteres',
    })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    email: string;

    @IsOptional()
    @IsArray({ message: 'Los roles deben ser una lista' })
    @IsEnum(UserRoles, {
        each: true,
        message: 'Cada rol debe ser uno de los valores permitidos',
    })
    @Transform(({ value }: { value: UserRoles[] | string | string[] }) => {
        if (typeof value === 'string') {
            return [value as UserRoles];
        }
        return value;
    })
    roles?: UserRoles[];
}
