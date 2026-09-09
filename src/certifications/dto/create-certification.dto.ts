import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';
import { IsMediaKey } from '@/common/decorators/media-key.decorator';

export class CreateCertificationDto {
    @IsNotEmpty({ message: 'El título es obligatorio' })
    @IsString({ message: 'El título debe ser una cadena de texto' })
    @MaxLength(120, {
        message: 'El título no puede tener más de 120 caracteres',
    })
    title: string;

    @IsNotEmpty({ message: 'El subtítulo es obligatorio' })
    @IsString({ message: 'El subtítulo debe ser una cadena de texto' })
    @MaxLength(120, {
        message: 'El subtítulo no puede tener más de 120 caracteres',
    })
    subtitle: string;

    @IsNotEmpty({ message: 'La descripción es obligatoria' })
    @IsString({ message: 'La descripción debe ser una cadena de texto' })
    @MaxLength(2000, {
        message: 'La descripción no puede tener más de 2000 caracteres',
    })
    description: string;

    @IsOptional()
    @IsBoolean({ message: 'isFeatured debe ser un booleano' })
    isFeatured?: boolean;

    @IsOptional()
    @IsMediaKey('El logo')
    logoImage?: string;

    // Key del PDF devuelta por POST /media/documents (bucket público).
    @IsOptional()
    @IsMediaKey('El certificado')
    certificatePdf?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El orden debe ser un número entero' })
    @Min(0, { message: 'El orden no puede ser negativo' })
    sortOrder?: number;
}
