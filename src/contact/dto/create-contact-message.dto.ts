import { Transform } from 'class-transformer';
import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

// Campos del formulario de contacto del sitio (nombre, email, teléfono
// opcional, asunto opcional, mensaje).
export class CreateContactMessageDto {
    @IsNotEmpty({ message: 'El nombre es obligatorio' })
    @IsString({ message: 'El nombre debe ser una cadena de texto' })
    @MaxLength(100, {
        message: 'El nombre no puede tener más de 100 caracteres',
    })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    name: string;

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
    @IsString({ message: 'El teléfono debe ser una cadena de texto' })
    @MaxLength(30, {
        message: 'El teléfono no puede tener más de 30 caracteres',
    })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    phone?: string;

    @IsOptional()
    @IsString({ message: 'El asunto debe ser una cadena de texto' })
    @MaxLength(150, {
        message: 'El asunto no puede tener más de 150 caracteres',
    })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    subject?: string;

    @IsNotEmpty({ message: 'El mensaje es obligatorio' })
    @IsString({ message: 'El mensaje debe ser una cadena de texto' })
    @MinLength(10, {
        message: 'El mensaje debe tener al menos 10 caracteres',
    })
    @MaxLength(5000, {
        message: 'El mensaje no puede tener más de 5000 caracteres',
    })
    message: string;

    /**
     * Campo TRAMPA (honeypot). En el formulario está fuera de pantalla y sin
     * acceso por teclado, así que una persona no puede completarlo: si llega
     * con algo, es un bot y el mensaje se descarta (ver ContactService.create).
     *
     * Tiene que estar declarado acá aunque no se use para nada: el
     * ValidationPipe global corre con `forbidNonWhitelisted`, así que un campo
     * que el DTO no conozca haría fallar el envío con 400.
     *
     * El nombre es a propósito uno que no dispara el autocompletado del
     * navegador ni de los gestores de contraseñas —nada de `email`, `nombre`,
     * `empresa` o `sitio-web`—: si el navegador lo completara solo, le
     * estaríamos descartando el mensaje a una persona real.
     */
    @IsOptional()
    @IsString()
    @MaxLength(200)
    referencia?: string;
}
