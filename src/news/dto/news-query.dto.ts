import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { NewsCategory } from '../enum/news-category.enum';

export class NewsQueryDto extends PaginationQueryDto {
    @IsOptional()
    @IsEnum(NewsCategory, {
        message: 'La categoría debe ser novedades o prensa',
    })
    category?: NewsCategory;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value === 'true' : value,
    )
    @IsBoolean({ message: 'featured debe ser true o false' })
    featured?: boolean;
}
