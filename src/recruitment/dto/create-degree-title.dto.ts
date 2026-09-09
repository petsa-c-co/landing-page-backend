import { Transform, Type } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';
import { DegreeTitleLevel } from '../enum/degree-title-level.enum';

export class CreateDegreeTitleDto {
    @IsNotEmpty({ message: 'El nombre del título es obligatorio' })
    @IsString({ message: 'El nombre del título debe ser una cadena de texto' })
    @MaxLength(150, {
        message: 'El nombre del título no puede tener más de 150 caracteres',
    })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    name: string;

    @IsNotEmpty({ message: 'El nivel del título es obligatorio' })
    // El mensaje se arma desde el enum para que no quede desactualizado al
    // agregar niveles nuevos.
    @IsEnum(DegreeTitleLevel, {
        message: `El nivel debe ser uno de: ${Object.values(DegreeTitleLevel).join(', ')}`,
    })
    level: DegreeTitleLevel;

    @IsOptional()
    @IsBoolean({ message: 'isActive debe ser un booleano' })
    isActive?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El orden debe ser un número entero' })
    @Min(0, { message: 'El orden no puede ser negativo' })
    sortOrder?: number;
}
