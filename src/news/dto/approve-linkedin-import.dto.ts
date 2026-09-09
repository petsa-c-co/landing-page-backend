import {
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { NewsCategory } from '../enum/news-category.enum';

/**
 * Datos que aporta admin/rrhh al aprobar un posteo de LinkedIn. La categoría es
 * obligatoria (es el "catalogar"); título y extracto son opcionales: si no se
 * envían, se derivan del texto del post. El cuerpo y la portada salen del
 * propio posteo importado.
 */
export class ApproveLinkedInImportDto {
    @IsNotEmpty({ message: 'La categoría es obligatoria' })
    @IsEnum(NewsCategory, {
        message: 'La categoría debe ser novedades o prensa',
    })
    category: NewsCategory;

    @IsOptional()
    @IsBoolean({ message: 'isFeatured debe ser un booleano' })
    isFeatured?: boolean;

    @IsOptional()
    @IsString({ message: 'El título debe ser una cadena de texto' })
    @MaxLength(200, {
        message: 'El título no puede tener más de 200 caracteres',
    })
    title?: string;

    @IsOptional()
    @IsString({ message: 'El extracto debe ser una cadena de texto' })
    @MaxLength(500, {
        message: 'El extracto no puede tener más de 500 caracteres',
    })
    excerpt?: string;
}
