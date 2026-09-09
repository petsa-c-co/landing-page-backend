import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { DegreeTitleLevel } from '../enum/degree-title-level.enum';

// Query de la tabla de administración de títulos (paginada). El endpoint
// público NO usa esto: devuelve todos los títulos activos para el
// autocompletado del formulario.
export class DegreeTitlesAdminQueryDto extends PaginationQueryDto {
    @IsOptional()
    @IsEnum(DegreeTitleLevel, {
        message: `El nivel debe ser uno de: ${Object.values(DegreeTitleLevel).join(', ')}`,
    })
    level?: DegreeTitleLevel;

    // Búsqueda por nombre (ILIKE parcial). Con 140+ títulos, el reclutador
    // busca "soldador" en vez de paginar a mano.
    @IsOptional()
    @IsString({ message: 'La búsqueda debe ser una cadena de texto' })
    @MaxLength(150, {
        message: 'La búsqueda no puede tener más de 150 caracteres',
    })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    search?: string;
}
