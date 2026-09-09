import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { LinkedInImportStatus } from '../enum/linkedin-import-status.enum';

export class LinkedInQueueQueryDto extends PaginationQueryDto {
    // Por defecto (sin este filtro) el servicio devuelve los pendientes.
    @IsOptional()
    @IsEnum(LinkedInImportStatus, {
        message: 'El estado debe ser pending, approved o rejected',
    })
    status?: LinkedInImportStatus;
}
