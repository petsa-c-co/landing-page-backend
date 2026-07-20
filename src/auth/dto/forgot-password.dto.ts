import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
    @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
    @IsEmail({}, { message: 'El correo electrónico debe ser válido' })
    @IsString({ message: 'El correo electrónico debe ser una cadena de texto' })
    // Misma normalización que en el registro, para que el lookup por email
    // encuentre la cuenta aunque el usuario escriba con mayúsculas.
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    email: string;
}
