import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { UserRoles } from '@/auth/enum/user-roles.enum';

interface CreatePendingUserInput {
    email: string;
    roles?: UserRoles[];
}

interface ActivateUserInput {
    name: string;
    surname: string;
    hashedPassword: string;
}

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    async findOneByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { email } });
    }

    async findOneById(id: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { id } });
    }

    async existsAdmin(): Promise<boolean> {
        // text[] con el operador de arrays: ¿algún usuario tiene el rol admin?
        const count = await this.userRepository
            .createQueryBuilder('user')
            .where(':role = ANY(user.roles)', { role: UserRoles.ADMIN })
            .getCount();
        return count > 0;
    }

    /**
     * Crea un usuario PENDIENTE de activación (invitado o sembrado): solo tiene
     * email y roles; nombre, apellido y contraseña quedan NULL hasta que el
     * usuario active su cuenta.
     */
    async createPendingUser(input: CreatePendingUserInput): Promise<User> {
        const existingUser = await this.findOneByEmail(input.email);
        if (existingUser) {
            throw new ConflictException('El correo electrónico ya está en uso');
        }

        const newUser = this.userRepository.create({
            email: input.email,
            roles: input.roles?.length ? input.roles : [UserRoles.USER],
            name: null,
            surname: null,
            password: null,
            isActive: false,
            isEmailVerified: false,
        });
        return this.userRepository.save(newUser);
    }

    /**
     * Completa una cuenta pendiente: fija nombre, apellido y contraseña, y la
     * marca como activa y verificada. passwordChangedAt invalida cualquier
     * token previo (aunque para una cuenta recién activada no habrá ninguno).
     */
    async activateUser(id: string, input: ActivateUserInput): Promise<void> {
        await this.userRepository.update(id, {
            name: input.name,
            surname: input.surname,
            password: input.hashedPassword,
            isActive: true,
            isEmailVerified: true,
            passwordChangedAt: new Date(),
        });
    }

    async updatePassword(id: string, newHashedPassword: string): Promise<void> {
        // passwordChangedAt invalida los access tokens emitidos antes del
        // cambio (lo comprueba JwtStrategy contra el claim iat).
        await this.userRepository.update(id, {
            password: newHashedPassword,
            passwordChangedAt: new Date(),
        });
    }
}
