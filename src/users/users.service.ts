import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { RefreshToken } from '@/auth/entities/refresh-token.entity';
import { UserStatus } from './enum/user-status.enum';
import { UserQueryDto } from './dto/user-query.dto';
import { paginate } from '@/common/utils/pagination.util';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';
import { accentInsensitiveLike } from '@/common/utils/accent-insensitive.util';

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
        // Se usa el repositorio directo y no RefreshTokenService a propósito:
        // AuthModule ya importa UsersModule, así que depender de él acá crearía
        // una dependencia circular entre módulos.
        @InjectRepository(RefreshToken)
        private readonly refreshTokenRepository: Repository<RefreshToken>,
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
        // Una cuenta que YA definió contraseña no se "activa": o está activa, o
        // fue dada de baja y corresponde reactivarla desde el panel. Sin este
        // chequeo, un token de activación sobreviviente pisaba nombre, apellido
        // y contraseña de una cuenta existente.
        const actual = await this.findOneById(id);
        if (actual?.password) {
            throw new ConflictException(
                'La cuenta ya fue activada por su titular.',
            );
        }

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

    // ── Administración de cuentas (solo admin) ───────────────────────────────

    /** Listado del panel: paginado, con búsqueda y filtros por rol y estado. */
    async findAll(query: UserQueryDto): Promise<PaginatedResult<User>> {
        const qb = this.userRepository.createQueryBuilder('user');

        if (query.search) {
            qb.andWhere(
                new Brackets((sub) => {
                    sub.where(accentInsensitiveLike('user.name', 'search'))
                        .orWhere(accentInsensitiveLike('user.surname', 'search'))
                        .orWhere(accentInsensitiveLike('user.email', 'search'));
                }),
            ).setParameter('search', `%${query.search}%`);
        }

        if (query.role) {
            // roles es text[]: se pregunta si el rol pedido está en el arreglo.
            qb.andWhere(':role = ANY(user.roles)', { role: query.role });
        }

        if (query.status) {
            this.applyStatusFilter(qb, query.status);
        }

        const [items, total] = await qb
            .orderBy('user.createdAt', 'DESC')
            .skip((query.page - 1) * query.limit)
            .take(query.limit)
            .getManyAndCount();

        return paginate(items, total, query);
    }

    // El estado no es una columna (ver UserStatus), así que el filtro se
    // traduce a las condiciones que lo definen.
    private applyStatusFilter(
        qb: SelectQueryBuilder<User>,
        status: UserStatus,
    ): void {
        if (status === UserStatus.ACTIVO) {
            qb.andWhere('user.isActive = true');
            return;
        }
        qb.andWhere('user.isActive = false').andWhere(
            status === UserStatus.PENDIENTE
                ? 'user.password IS NULL'
                : 'user.password IS NOT NULL',
        );
    }

    /**
     * Cuántos administradores CON acceso quedan, sin contar a `excludeId`.
     *
     * Red de seguridad del invariante "siempre tiene que haber un admin". Hoy
     * es redundante: quien llama a estos endpoints es, por definición, un admin
     * activo, así que nunca puede ser el último. Lo que realmente sostiene el
     * invariante son los chequeos de "no sobre uno mismo". Se conserva por si
     * mañana aparece una operación masiva o se relaja aquel chequeo.
     */
    async countActiveAdmins(excludeId?: string): Promise<number> {
        const qb = this.userRepository
            .createQueryBuilder('user')
            .where(':role = ANY(user.roles)', { role: UserRoles.ADMIN })
            .andWhere('user.isActive = true');

        if (excludeId) {
            qb.andWhere('user.id != :excludeId', { excludeId });
        }
        return qb.getCount();
    }

    private async findOneOrFail(id: string): Promise<User> {
        const user = await this.findOneById(id);
        if (!user) {
            throw new NotFoundException('El usuario no existe');
        }
        return user;
    }

    /**
     * Corta el acceso de una cuenta. El efecto es inmediato: JwtStrategy
     * consulta al usuario en cada request y rechaza a los inactivos, así que
     * las sesiones abiertas dejan de servir sin esperar a que venza el token.
     */
    async deactivate(id: string, requester: User): Promise<User> {
        if (id === requester.id) {
            throw new ConflictException(
                'No podés desactivar tu propia cuenta. Pedíselo a otro administrador.',
            );
        }

        const user = await this.findOneOrFail(id);
        if (!user.isActive) {
            throw new ConflictException('La cuenta ya no tiene acceso');
        }

        if (
            user.roles.includes(UserRoles.ADMIN) &&
            (await this.countActiveAdmins(user.id)) === 0
        ) {
            throw new ConflictException(
                'No se puede desactivar al último administrador activo: el sistema quedaría sin nadie que pueda administrarlo.',
            );
        }

        user.isActive = false;
        const saved = await this.userRepository.save(user);

        // Además se cortan las sesiones, para que no pueda renovar. Si esto
        // fallara, el acceso ya está cortado igual por el chequeo de isActive
        // en cada request.
        await this.cortarSesiones(user.id);

        return saved;
    }

    /** Devuelve el acceso a una cuenta dada de baja. */
    async reactivate(id: string): Promise<User> {
        const user = await this.findOneOrFail(id);

        if (user.isActive) {
            throw new ConflictException('La cuenta ya está activa');
        }
        // Una invitación sin aceptar no tiene contraseña: activarla dejaría una
        // cuenta imposible de usar. El camino correcto es reenviar la invitación.
        if (!user.password) {
            throw new ConflictException(
                'La cuenta nunca fue activada por su titular. Reenviale la invitación en lugar de reactivarla.',
            );
        }

        user.isActive = true;
        return this.userRepository.save(user);
    }

    /**
     * Cierra todas las sesiones abiertas de una cuenta, sin darla de baja: el
     * usuario sigue activo y puede volver a entrar con su contraseña.
     *
     * Corta por los dos lados, que es lo que hace útil al endpoint frente a una
     * notebook perdida: revoca los refresh tokens (no puede renovar) y marca
     * `sessionsRevokedAt` (los access tokens ya emitidos dejan de valer en el
     * acto, sin esperar los 15 minutos que les quedaban).
     *
     * Devuelve cuántas sesiones se cerraron, para poder confirmarlo en el panel.
     */
    async revokeSessions(id: string, requester: User): Promise<number> {
        if (id === requester.id) {
            throw new ConflictException(
                'No podés cerrar tus propias sesiones desde acá: te dejaría afuera del panel. Cambiá tu contraseña si necesitás invalidarlas.',
            );
        }

        const user = await this.findOneOrFail(id);

        const revocados = await this.cortarSesiones(user.id);

        user.sessionsRevokedAt = new Date();
        await this.userRepository.save(user);

        return revocados;
    }

    /**
     * Revoca todos los refresh tokens de una cuenta y devuelve cuántas sesiones
     * había abiertas.
     *
     * Los dos pasos son distintos a propósito. El primero solo toca los tokens
     * vivos, que es lo que hay que contar. El segundo anula el `rotatedAt` de
     * TODOS —incluidos los ya rotados—: son los que conservan la marca que
     * habilita la ventana de gracia de RefreshTokenService, y sin borrarla el
     * pase anterior seguía siendo canjeable unos segundos después de haber
     * cortado las sesiones a propósito.
     */
    private async cortarSesiones(userId: string): Promise<number> {
        const { affected } = await this.refreshTokenRepository.update(
            { user: { id: userId }, isRevoked: false },
            { isRevoked: true },
        );

        await this.refreshTokenRepository.update(
            { user: { id: userId } },
            { rotatedAt: null },
        );

        return affected ?? 0;
    }

    /**
     * Borra una invitación que nunca fue aceptada.
     *
     * Es el único borrado real de usuarios que existe, y está acotado a
     * propósito: una cuenta pendiente no tiene historia —nunca inició sesión ni
     * definió contraseña— así que eliminarla no pierde nada, y es la única
     * salida cuando se invitó a una dirección equivocada (`deactivate` no sirve
     * ahí: exige que la cuenta esté activa). Las cuentas que sí se usaron se dan
     * de baja con `deactivate`, que es reversible y conserva el rastro.
     *
     * No hace falta impedir que un admin se borre a sí mismo: para llegar hasta
     * acá hay que tener sesión iniciada, y una cuenta pendiente no puede tenerla.
     */
    async deletePendingInvitation(id: string): Promise<void> {
        const user = await this.findOneOrFail(id);

        if (user.status !== UserStatus.PENDIENTE) {
            throw new ConflictException(
                'Solo se pueden eliminar invitaciones que nunca fueron aceptadas. Para quitarle el acceso a una cuenta en uso, desactivala.',
            );
        }

        // Su token de activación se va con ella: la FK está en cascada.
        await this.userRepository.remove(user);
    }

    /**
     * Reemplaza los roles de una cuenta. Toma efecto de inmediato, porque los
     * roles se leen de la base en cada request y no del token.
     */
    async updateRoles(
        id: string,
        roles: UserRoles[],
        requester: User,
    ): Promise<User> {
        if (id === requester.id) {
            throw new ConflictException(
                'No podés cambiar tus propios roles. Pedíselo a otro administrador.',
            );
        }

        const user = await this.findOneOrFail(id);
        const nuevosRoles = [...new Set(roles)];

        const pierdeAdmin =
            user.roles.includes(UserRoles.ADMIN) &&
            !nuevosRoles.includes(UserRoles.ADMIN);

        if (
            pierdeAdmin &&
            user.isActive &&
            (await this.countActiveAdmins(user.id)) === 0
        ) {
            throw new ConflictException(
                'No se puede quitar el rol de administrador al último que queda activo.',
            );
        }

        user.roles = nuevosRoles;
        return this.userRepository.save(user);
    }
}
