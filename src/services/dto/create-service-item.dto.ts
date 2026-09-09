import { Type } from 'class-transformer';
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateServiceItemDto {
    @IsNotEmpty({ message: 'El texto del item es obligatorio' })
    @IsString({ message: 'El texto del item debe ser una cadena de texto' })
    @MaxLength(200, {
        message: 'El texto del item no puede tener más de 200 caracteres',
    })
    label: string;

    @IsOptional()
    @IsString({ message: 'La especificación debe ser una cadena de texto' })
    @MaxLength(200, {
        message: 'La especificación no puede tener más de 200 caracteres',
    })
    spec?: string;

    @IsOptional()
    @IsString({ message: 'El ícono debe ser una cadena de texto' })
    @MaxLength(50, {
        message: 'El ícono no puede tener más de 50 caracteres',
    })
    icon?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El orden debe ser un número entero' })
    @Min(0, { message: 'El orden no puede ser negativo' })
    sortOrder?: number;
}
