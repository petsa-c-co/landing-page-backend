import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

@Controller('clients')
export class ClientsController {
    constructor(private readonly clientsService: ClientsService) {}

    @Get()
    @ResponseMessage('Clientes obtenidos correctamente')
    findAll(): Promise<Client[]> {
        return this.clientsService.findAllPublic();
    }

    @Get('admin')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Clientes obtenidos correctamente')
    findAllAdmin(): Promise<Client[]> {
        return this.clientsService.findAllAdmin();
    }

    @Post()
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Cliente creado correctamente')
    create(@Body() createClientDto: CreateClientDto): Promise<Client> {
        return this.clientsService.create(createClientDto);
    }

    @Patch(':id')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Cliente actualizado correctamente')
    update(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Body() updateClientDto: UpdateClientDto,
    ): Promise<Client> {
        return this.clientsService.update(id, updateClientDto);
    }

    @Delete(':id')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Cliente movido a la papelera')
    remove(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.clientsService.remove(id);
    }

    // Papelera: clientes borrados (soft delete).
    @Get('admin/trash')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Papelera obtenida correctamente')
    findTrash(): Promise<Client[]> {
        return this.clientsService.findTrash();
    }

    @Post(':id/restore')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Cliente restaurado correctamente')
    restore(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<Client> {
        return this.clientsService.restore(id);
    }

    @Delete(':id/permanent')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Cliente eliminado definitivamente')
    removePermanent(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.clientsService.removePermanent(id);
    }
}
