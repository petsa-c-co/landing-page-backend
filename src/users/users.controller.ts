import {
    BadRequestException,
    Controller,
    ForbiddenException,
    Get,
    NotFoundException,
    ParseUUIDPipe,
    Param,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Auth } from '@/auth/decorators/auth.decorator';
import { GetUser } from '@/auth/decorators/get-user.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get(':id')
    @Auth()
    @ResponseMessage('Usuario obtenido correctamente')
    async findOneById(
        @Param(
            'id',
            new ParseUUIDPipe({
                version: '4',
                exceptionFactory: (): BadRequestException =>
                    new BadRequestException('El id debe ser un UUID v4 válido'),
            }),
        )
        id: string,
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
}
