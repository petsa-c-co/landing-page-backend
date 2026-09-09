import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContactService } from './contact.service';
import { ContactMessage } from './entities/contact-message.entity';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto';
import { ContactQueryDto } from './dto/contact-query.dto';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

@Controller('contact')
export class ContactController {
    constructor(private readonly contactService: ContactService) {}

    // Formulario público de contacto. 5/min por IP: da margen a quien se
    // equivoca y reenvía (y a varias personas detrás de una misma IP por
    // CGNAT/oficina) sin abrir la puerta al spam. El abuso está acotado además
    // por el largo máximo del mensaje y la validación del DTO.
    @Post()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @ResponseMessage('¡Gracias! Tu mensaje fue enviado correctamente.')
    create(
        @Body() createContactMessageDto: CreateContactMessageDto,
    ): Promise<{ id: string }> {
        return this.contactService.create(createContactMessageDto);
    }

    @Get('messages')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Mensajes obtenidos correctamente')
    findAll(
        @Query() query: ContactQueryDto,
    ): Promise<PaginatedResult<ContactMessage>> {
        return this.contactService.findAll(query);
    }

    @Patch('messages/:id')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Mensaje actualizado correctamente')
    updateStatus(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Body() updateContactMessageDto: UpdateContactMessageDto,
    ): Promise<ContactMessage> {
        return this.contactService.updateStatus(
            id,
            updateContactMessageDto.status,
        );
    }

    @Delete('messages/:id')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Mensaje eliminado correctamente')
    remove(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.contactService.remove(id);
    }
}
