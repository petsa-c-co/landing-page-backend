import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { ContactMessageStatus } from '../enum/contact-message-status.enum';

export class ContactQueryDto extends PaginationQueryDto {
    @IsOptional()
    @IsEnum(ContactMessageStatus, {
        message: 'El estado debe ser nueva o leida',
    })
    status?: ContactMessageStatus;
}
