import { IsEnum, IsOptional } from 'class-validator';
import { DegreeTitleLevel } from '../enum/degree-title-level.enum';

export class DegreeTitlesQueryDto {
    // Sin este DTO, un nivel inválido llegaba hasta Postgres y el error de
    // enum filtraba el nombre interno de la columna en la respuesta.
    // El mensaje se arma desde el enum para no quedar desactualizado al
    // agregar niveles nuevos.
    @IsOptional()
    @IsEnum(DegreeTitleLevel, {
        message: `El nivel debe ser uno de: ${Object.values(DegreeTitleLevel).join(', ')}`,
    })
    level?: DegreeTitleLevel;
}
