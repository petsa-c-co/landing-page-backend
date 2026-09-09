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
import { DegreeTitlesService } from '../services/degree-titles.service';
import { DegreeTitle } from '../entities/degree-title.entity';
import { CreateDegreeTitleDto } from '../dto/create-degree-title.dto';
import { UpdateDegreeTitleDto } from '../dto/update-degree-title.dto';
import { DegreeTitlesQueryDto } from '../dto/degree-titles-query.dto';
import { DegreeTitlesAdminQueryDto } from '../dto/degree-titles-admin-query.dto';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

@Controller('recruitment/degree-titles')
export class DegreeTitlesController {
    constructor(private readonly degreeTitlesService: DegreeTitlesService) {}

    // Público: alimenta el autocompletado del campo "Título" del formulario.
    @Get()
    @ResponseMessage('Títulos obtenidos correctamente')
    findAllActive(
        @Query() query: DegreeTitlesQueryDto,
    ): Promise<DegreeTitle[]> {
        return this.degreeTitlesService.findAllActive(query.level);
    }

    // Panel: paginado, con filtro por nivel y búsqueda por nombre.
    @Get('admin')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Títulos obtenidos correctamente')
    findAllAdmin(
        @Query() query: DegreeTitlesAdminQueryDto,
    ): Promise<PaginatedResult<DegreeTitle>> {
        return this.degreeTitlesService.findAllAdmin(query);
    }

    @Post()
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Título creado correctamente')
    create(
        @Body() createDegreeTitleDto: CreateDegreeTitleDto,
    ): Promise<DegreeTitle> {
        return this.degreeTitlesService.create(createDegreeTitleDto);
    }

    @Patch(':id')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Título actualizado correctamente')
    update(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Body() updateDegreeTitleDto: UpdateDegreeTitleDto,
    ): Promise<DegreeTitle> {
        return this.degreeTitlesService.update(id, updateDegreeTitleDto);
    }

    @Delete(':id')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Título movido a la papelera')
    remove(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.degreeTitlesService.remove(id);
    }

    // Papelera: títulos borrados (soft delete).
    @Get('admin/trash')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Papelera obtenida correctamente')
    findTrash(): Promise<DegreeTitle[]> {
        return this.degreeTitlesService.findTrash();
    }

    @Post(':id/restore')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Título restaurado correctamente')
    restore(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<DegreeTitle> {
        return this.degreeTitlesService.restore(id);
    }

    @Delete(':id/permanent')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Título eliminado definitivamente')
    removePermanent(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.degreeTitlesService.removePermanent(id);
    }
}
