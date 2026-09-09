import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { ServiceItemsLayout } from '../enum/service-items-layout.enum';
import { CreateServiceItemDto } from './create-service-item.dto';
import { SLUG_MESSAGE, SLUG_PATTERN } from '@/common/utils/slug.util';
import { IsMediaKey } from '@/common/decorators/media-key.decorator';

export class CreateServiceDto {
    @IsNotEmpty({ message: 'El título es obligatorio' })
    @IsString({ message: 'El título debe ser una cadena de texto' })
    @MaxLength(120, {
        message: 'El título no puede tener más de 120 caracteres',
    })
    title: string;

    // Si no se envía, se genera a partir del título. "admin" está reservado
    // porque colisiona con las rutas del panel (ver SLUG_PATTERN).
    @IsOptional()
    @IsString({ message: 'El slug debe ser una cadena de texto' })
    @MaxLength(140, { message: 'El slug no puede tener más de 140 caracteres' })
    @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
    slug?: string;

    @IsNotEmpty({ message: 'La descripción corta es obligatoria' })
    @IsString({ message: 'La descripción corta debe ser una cadena de texto' })
    @MaxLength(500, {
        message: 'La descripción corta no puede tener más de 500 caracteres',
    })
    shortDescription: string;

    @IsNotEmpty({ message: 'La descripción larga es obligatoria' })
    @IsString({ message: 'La descripción larga debe ser una cadena de texto' })
    @MaxLength(10000, {
        message: 'La descripción larga no puede tener más de 10000 caracteres',
    })
    longDescription: string;

    @IsOptional()
    @IsMediaKey('La imagen de card')
    cardImage?: string;

    @IsOptional()
    @IsMediaKey('La imagen de banner')
    bannerImage?: string;

    @IsOptional()
    @IsMediaKey('La imagen de detalle')
    detailImage?: string;

    @IsOptional()
    @IsEnum(ServiceItemsLayout, {
        message: 'El layout debe ser bullets, icons o numbered',
    })
    itemsLayout?: ServiceItemsLayout;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El orden debe ser un número entero' })
    @Min(0, { message: 'El orden no puede ser negativo' })
    sortOrder?: number;

    @IsOptional()
    @IsBoolean({ message: 'isActive debe ser un booleano' })
    isActive?: boolean;

    @IsOptional()
    @IsArray({ message: 'Los items deben ser una lista' })
    @ValidateNested({ each: true })
    @Type(() => CreateServiceItemDto)
    items?: CreateServiceItemDto[];
}
