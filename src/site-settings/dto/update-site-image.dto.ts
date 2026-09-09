import {
    IsNotEmpty,
    IsString,
    Matches,
    MaxLength,
    ValidateIf,
} from 'class-validator';
import { IsMediaKey } from '@/common/decorators/media-key.decorator';

/**
 * Asigna (o limpia) la imagen de un slot del sitio.
 *  - imageKey con una key  → se asigna/reemplaza.
 *  - imageKey en null      → se limpia el slot (y se borra la imagen del almacenamiento).
 */
export class UpdateSiteImageDto {
    @IsNotEmpty({ message: 'El slot es obligatorio' })
    @IsString({ message: 'El slot debe ser una cadena de texto' })
    @MaxLength(60, { message: 'El slot no puede tener más de 60 caracteres' })
    // Mismo formato que los slugs del proyecto: evita que un typo con espacios
    // o mayúsculas cree un slot fantasma que nadie vuelve a encontrar.
    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message:
            'El slot solo admite minúsculas, números y guiones (ej: banner-nosotros)',
    })
    slot: string;

    // @ValidateIf en vez de @IsOptional(): hay que aceptar null (limpiar el
    // slot) pero validar de verdad cuando viene un valor. Con @IsOptional() a
    // secas, una URL absoluta pasaba y se guardaba en lugar de la key.
    @ValidateIf((_, valor) => valor !== null && valor !== undefined)
    @IsMediaKey('La imagen')
    imageKey?: string | null;
}
