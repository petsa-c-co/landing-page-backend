import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query params estándar para endpoints paginados: ?page=2&limit=10
 * Extiéndelo para agregar filtros/orden específicos de cada recurso.
 */
export class PaginationQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'page debe ser un número entero' })
    @Min(1, { message: 'page debe ser al menos 1' })
    page = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'limit debe ser un número entero' })
    @Min(1, { message: 'limit debe ser al menos 1' })
    @Max(100, { message: 'limit no puede ser mayor a 100' })
    limit = 10;
}
