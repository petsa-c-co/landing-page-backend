import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginUserDto {
    @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
    @IsEmail({}, { message: 'El correo electrónico debe ser válido' })
    @IsString({ message: 'El correo electrónico debe ser una cadena de texto' })
    // Misma normalización que en el registro: sin ella, un usuario que escriba
    // su email con mayúsculas no encontraría su cuenta (se guarda en minúsculas).
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    email: string;

    @IsNotEmpty({ message: 'La contraseña es obligatoria' })
    @IsString({ message: 'La contraseña debe ser una cadena de texto' })
    password: string;
}
