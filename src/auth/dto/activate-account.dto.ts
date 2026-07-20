import { Transform } from 'class-transformer';
import {
    IsNotEmpty,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

// Datos que el usuario invitado define al activar su cuenta: nombre, apellido
// y contraseña, más el token opaco recibido por correo.
export class ActivateAccountDto {
    @IsNotEmpty({ message: 'El token de activación es obligatorio' })
    @Matches(/^[a-f0-9]{64}$/, {
        message: 'El token de activación no tiene un formato válido',
    })
    token: string;

    @IsNotEmpty({ message: 'El nombre es obligatorio' })
    @IsString({ message: 'El nombre debe ser una cadena de texto' })
    @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
    @MaxLength(25, { message: 'El nombre no puede tener más de 25 caracteres' })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' && value.length > 0
            ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
            : value,
    )
    name: string;

    @IsNotEmpty({ message: 'El apellido es obligatorio' })
    @IsString({ message: 'El apellido debe ser una cadena de texto' })
    @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
    @MaxLength(25, {
        message: 'El apellido no puede tener más de 25 caracteres',
    })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' && value.length > 0
            ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
            : value,
    )
    surname: string;

    @IsNotEmpty({ message: 'La contraseña es obligatoria' })
    @IsString({ message: 'La contraseña debe ser una cadena de texto' })
    @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
    @MaxLength(64, {
        message: 'La contraseña no puede tener más de 64 caracteres',
    })
    @Matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/,
        {
            message:
                'La contraseña debe tener al menos 8 caracteres y contener al menos una mayúscula, una minúscula, un número y un carácter especial',
        },
    )
    password: string;
}
