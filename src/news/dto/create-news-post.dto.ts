import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsDate,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    MaxLength,
} from 'class-validator';
import { NewsCategory } from '../enum/news-category.enum';
import { SLUG_MESSAGE, SLUG_PATTERN } from '@/common/utils/slug.util';
import { IsMediaKey } from '@/common/decorators/media-key.decorator';

export class CreateNewsPostDto {
    @IsNotEmpty({ message: 'El título es obligatorio' })
    @IsString({ message: 'El título debe ser una cadena de texto' })
    @MaxLength(200, {
        message: 'El título no puede tener más de 200 caracteres',
    })
    title: string;

    // Si no se envía, se genera a partir del título. "admin" está reservado
    // porque colisiona con las rutas del panel.
    @IsOptional()
    @IsString({ message: 'El slug debe ser una cadena de texto' })
    @MaxLength(220, { message: 'El slug no puede tener más de 220 caracteres' })
    @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
    slug?: string;

    @IsNotEmpty({ message: 'La categoría es obligatoria' })
    @IsEnum(NewsCategory, {
        message: 'La categoría debe ser novedades o prensa',
    })
    category: NewsCategory;

    @IsOptional()
    @Type(() => Date)
    @IsDate({ message: 'La fecha de publicación no es válida' })
    publishedAt?: Date;

    @IsOptional()
    @IsMediaKey('La imagen de portada')
    coverImage?: string;

    @IsNotEmpty({ message: 'El extracto es obligatorio' })
    @IsString({ message: 'El extracto debe ser una cadena de texto' })
    @MaxLength(500, {
        message: 'El extracto no puede tener más de 500 caracteres',
    })
    excerpt: string;

    @IsNotEmpty({ message: 'El cuerpo es obligatorio' })
    @IsString({ message: 'El cuerpo debe ser una cadena de texto' })
    @MaxLength(100000, {
        message: 'El cuerpo excede el tamaño máximo permitido',
    })
    body: string;

    @IsOptional()
    @IsBoolean({ message: 'isFeatured debe ser un booleano' })
    isFeatured?: boolean;

    @IsOptional()
    @IsBoolean({ message: 'isPublished debe ser un booleano' })
    isPublished?: boolean;

    @IsOptional()
    @IsUrl({}, { message: 'La URL externa debe ser una URL válida' })
    @MaxLength(500)
    externalUrl?: string;
}
