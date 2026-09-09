import { IsEnum, IsNotEmpty } from 'class-validator';
import { ContactMessageStatus } from '../enum/contact-message-status.enum';

export class UpdateContactMessageDto {
    @IsNotEmpty({ message: 'El estado es obligatorio' })
    @IsEnum(ContactMessageStatus, {
        message: 'El estado debe ser nueva o leida',
    })
    status: ContactMessageStatus;
}
