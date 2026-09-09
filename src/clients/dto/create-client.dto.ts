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

export class CreateClientDto {
    @IsNotEmpty({ message: 'El nombre es obligatorio' })
    @IsString({ message: 'El nombre debe ser una cadena de texto' })
    @MaxLength(120, {
        message: 'El nombre no puede tener más de 120 caracteres',
    })
    name: string;

    @IsNotEmpty({ message: 'El logo es obligatorio' })
    @IsMediaKey('El logo')
    logoImage: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El orden debe ser un número entero' })
    @Min(0, { message: 'El orden no puede ser negativo' })
    sortOrder?: number;

    @IsOptional()
    @IsBoolean({ message: 'isActive debe ser un booleano' })
    isActive?: boolean;
}
