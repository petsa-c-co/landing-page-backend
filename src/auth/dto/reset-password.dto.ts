import {
    IsNotEmpty,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

export class ResetPasswordDto {
    @IsNotEmpty({ message: 'El token de restablecimiento es obligatorio' })
    @Matches(/^[a-f0-9]{64}$/, {
        message: 'El token de restablecimiento no tiene un formato válido',
    })
    token: string;

    @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
    @IsString({ message: 'La nueva contraseña debe ser una cadena de texto' })
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
    newPassword: string;
}
