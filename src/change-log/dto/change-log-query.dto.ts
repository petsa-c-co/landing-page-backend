import { Type } from 'class-transformer';
import {
    IsEnum,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { ChangeAction } from '../entities/change-log-entry.entity';

/** Filtros del registro de cambios, comunes al listado y a la exportación. */
export class ChangeLogQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    /** Desde esta fecha inclusive, `YYYY-MM-DD`. */
    @IsOptional()
    @IsISO8601({ strict: false }, { message: 'La fecha desde no es válida' })
    from?: string;

    @IsOptional()
    @IsISO8601({ strict: false }, { message: 'La fecha hasta no es válida' })
    to?: string;

    /** `servicio`, `certificacion`, `cliente`… (ver audited-entities.ts). */
    @IsOptional()
    @IsString()
    @MaxLength(40)
    entityType?: string;

    @IsOptional()
    @IsEnum(ChangeAction, { message: 'La acción no es válida' })
    action?: ChangeAction;
}
