import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    NotFoundException,
    ParseUUIDPipe,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Auth } from '@/auth/decorators/auth.decorator';
import { GetUser } from '@/auth/decorators/get-user.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';

// Mismo mensaje de error para el :id en todas las rutas del controlador.
const idParam = new ParseUUIDPipe({
    version: '4',
    exceptionFactory: (): BadRequestException =>
        new BadRequestException('El id debe ser un UUID v4 válido'),
});

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Usuarios obtenidos correctamente')
    findAll(@Query() query: UserQueryDto): Promise<PaginatedResult<User>> {
        return this.usersService.findAll(query);
    }

    @Get(':id')
    @Auth()
    @ResponseMessage('Usuario obtenido correctamente')
    async findOneById(
        @Param('id', idParam) id: string,
        @GetUser() requester: User,
    ): Promise<User> {
        // Evita IDOR: un usuario solo puede consultarse a sí mismo; un admin
        // puede consultar a cualquiera. El chequeo va ANTES de la búsqueda para
        // no revelar si el id existe (403 siempre para ids ajenos).
        const isAdmin = requester.roles.includes(UserRoles.ADMIN);
        if (!isAdmin && requester.id !== id) {
            throw new ForbiddenException(
                'No tienes permiso para acceder a este usuario',
            );
        }

        const user = await this.usersService.findOneById(id);
        if (!user) {
            throw new NotFoundException('El usuario no existe');
        }
        return user;
    }

    @Post(':id/deactivate')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Acceso desactivado correctamente')
    deactivate(
        @Param('id', idParam) id: string,
        @GetUser() requester: User,
    ): Promise<User> {
        return this.usersService.deactivate(id, requester);
    }

    @Post(':id/reactivate')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Acceso restablecido correctamente')
    reactivate(@Param('id', idParam) id: string): Promise<User> {
        return this.usersService.reactivate(id);
    }

    @Post(':id/revoke-sessions')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Sesiones cerradas correctamente')
    async revokeSessions(
        @Param('id', idParam) id: string,
        @GetUser() requester: User,
    ): Promise<{ sessionsClosed: number }> {
        const sessionsClosed = await this.usersService.revokeSessions(
            id,
            requester,
        );
        return { sessionsClosed };
    }

    // Solo invitaciones sin aceptar: ver UsersService.deletePendingInvitation.
    @Delete(':id')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Invitación eliminada correctamente')
    remove(@Param('id', idParam) id: string): Promise<void> {
        return this.usersService.deletePendingInvitation(id);
    }

    @Patch(':id/roles')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Roles actualizados correctamente')
    updateRoles(
        @Param('id', idParam) id: string,
        @Body() updateUserRolesDto: UpdateUserRolesDto,
        @GetUser() requester: User,
    ): Promise<User> {
        return this.usersService.updateRoles(
            id,
            updateUserRolesDto.roles,
            requester,
        );
    }
}
