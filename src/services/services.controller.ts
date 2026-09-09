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
import { ServicesService } from './services.service';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

@Controller('services')
export class ServicesController {
    constructor(private readonly servicesService: ServicesService) {}

    @Get()
    @ResponseMessage('Servicios obtenidos correctamente')
    findAll(): Promise<Service[]> {
        return this.servicesService.findAllPublic();
    }

    // Ruta estática ANTES de :slug para que no la capture el parámetro.
    @Get('admin')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Servicios obtenidos correctamente')
    findAllAdmin(): Promise<Service[]> {
        return this.servicesService.findAllAdmin();
    }

    @Get(':slug')
    @ResponseMessage('Servicio obtenido correctamente')
    findOne(@Param('slug') slug: string): Promise<Service> {
        return this.servicesService.findOneBySlug(slug);
    }

    @Post()
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Servicio creado correctamente')
    create(@Body() createServiceDto: CreateServiceDto): Promise<Service> {
        return this.servicesService.create(createServiceDto);
    }

    @Patch(':id')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Servicio actualizado correctamente')
    update(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Body() updateServiceDto: UpdateServiceDto,
    ): Promise<Service> {
        return this.servicesService.update(id, updateServiceDto);
    }

    @Delete(':id')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Servicio movido a la papelera')
    remove(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.servicesService.remove(id);
    }

    // Papelera: servicios borrados (soft delete).
    @Get('admin/trash')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Papelera obtenida correctamente')
    findTrash(): Promise<Service[]> {
        return this.servicesService.findTrash();
    }

    @Post(':id/restore')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Servicio restaurado correctamente')
    restore(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<Service> {
        return this.servicesService.restore(id);
    }

    @Delete(':id/permanent')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Servicio eliminado definitivamente')
    removePermanent(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.servicesService.removePermanent(id);
    }
}
