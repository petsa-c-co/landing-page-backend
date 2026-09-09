import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { UserStatus } from './enum/user-status.enum';
import { RefreshToken } from '@/auth/entities/refresh-token.entity';

// Se construye con `new User()` para que el getter `status` siga existiendo.
const makeUser = (over: Partial<User> = {}): User =>
    Object.assign(new User(), {
        id: 'u1',
        name: 'Ana',
        surname: 'Pérez',
        email: 'ana@x.com',
        password: 'hash',
        passwordChangedAt: null,
        isActive: true,
        roles: [UserRoles.RRHH],
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...over,
    });

describe('UsersService (administración de cuentas)', () => {
    let service: UsersService;
    let repo: {
        findOne: jest.Mock;
        save: jest.Mock;
        remove: jest.Mock;
        createQueryBuilder: jest.Mock;
    };
    let refreshRepo: { update: jest.Mock };
    // Cuántos OTROS administradores activos quedan (lo que devuelve el count).
    let otrosAdminsActivos: number;

    const requester = makeUser({ id: 'admin-1', roles: [UserRoles.ADMIN] });

    beforeEach(() => {
        otrosAdminsActivos = 1;
        repo = {
            findOne: jest.fn(),
            save: jest.fn((u: User) => Promise.resolve(u)),
            remove: jest.fn((u: User) => Promise.resolve(u)),
            createQueryBuilder: jest.fn(() => ({
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                getCount: jest.fn(() => Promise.resolve(otrosAdminsActivos)),
            })),
        };
        refreshRepo = { update: jest.fn().mockResolvedValue({ affected: 0 }) };

        service = new UsersService(
            repo as unknown as Repository<User>,
            refreshRepo as unknown as Repository<RefreshToken>,
        );
    });

    describe('estado derivado', () => {
        it.each([
            [{ isActive: true }, UserStatus.ACTIVO],
            [{ isActive: false, password: null }, UserStatus.PENDIENTE],
            [{ isActive: false, password: 'hash' }, UserStatus.DESACTIVADO],
        ])('%o => %s', (campos, esperado) => {
            expect(makeUser(campos).status).toBe(esperado);
        });
    });

    describe('desactivar', () => {
        it('no permite desactivarse a uno mismo', async () => {
            await expect(
                service.deactivate(requester.id, requester),
            ).rejects.toThrow(ConflictException);
            // Ni siquiera consulta: el chequeo va antes.
            expect(repo.findOne).not.toHaveBeenCalled();
        });

        it('falla si el usuario no existe', async () => {
            repo.findOne.mockResolvedValue(null);
            await expect(service.deactivate('u1', requester)).rejects.toThrow(
                NotFoundException,
            );
        });

        it('rechaza una cuenta que ya no tiene acceso', async () => {
            repo.findOne.mockResolvedValue(makeUser({ isActive: false }));
            await expect(service.deactivate('u1', requester)).rejects.toThrow(
                ConflictException,
            );
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('no deja al sistema sin ningún administrador activo', async () => {
            otrosAdminsActivos = 0;
            repo.findOne.mockResolvedValue(
                makeUser({ roles: [UserRoles.ADMIN] }),
            );

            await expect(service.deactivate('u1', requester)).rejects.toThrow(
                ConflictException,
            );
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('desactiva a un admin si queda otro, y revoca sus sesiones', async () => {
            otrosAdminsActivos = 1;
            repo.findOne.mockResolvedValue(
                makeUser({ roles: [UserRoles.ADMIN] }),
            );

            const resultado = await service.deactivate('u1', requester);

            expect(resultado.isActive).toBe(false);
            expect(resultado.status).toBe(UserStatus.DESACTIVADO);
            expect(refreshRepo.update).toHaveBeenCalledWith(
                { user: { id: 'u1' }, isRevoked: false },
                { isRevoked: true },
            );
            // Y la ventana de gracia queda sin nada a lo que agarrarse: los
            // tokens ya rotados pierden su rotatedAt.
            expect(refreshRepo.update).toHaveBeenLastCalledWith(
                { user: { id: 'u1' } },
                { rotatedAt: null },
            );
        });
    });

    describe('reactivar', () => {
        it('rechaza una invitación que nunca fue aceptada', async () => {
            repo.findOne.mockResolvedValue(
                makeUser({ isActive: false, password: null }),
            );

            await expect(service.reactivate('u1')).rejects.toThrow(
                ConflictException,
            );
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('rechaza una cuenta que ya está activa', async () => {
            repo.findOne.mockResolvedValue(makeUser({ isActive: true }));
            await expect(service.reactivate('u1')).rejects.toThrow(
                ConflictException,
            );
        });

        it('devuelve el acceso a una cuenta dada de baja', async () => {
            repo.findOne.mockResolvedValue(
                makeUser({ isActive: false, password: 'hash' }),
            );

            const resultado = await service.reactivate('u1');

            expect(resultado.isActive).toBe(true);
            expect(resultado.status).toBe(UserStatus.ACTIVO);
        });
    });

    describe('cerrar sesiones', () => {
        it('revoca los refresh tokens y marca la invalidación de los access', async () => {
            const user = makeUser();
            repo.findOne.mockResolvedValue(user);
            refreshRepo.update.mockResolvedValue({ affected: 3 });

            const cerradas = await service.revokeSessions('u1', requester);

            expect(cerradas).toBe(3);
            expect(refreshRepo.update).toHaveBeenCalledWith(
                { user: { id: 'u1' }, isRevoked: false },
                { isRevoked: true },
            );
            // El conteo sale del primer update (solo los vivos); el segundo
            // anula la ventana de gracia de los ya rotados.
            expect(refreshRepo.update).toHaveBeenLastCalledWith(
                { user: { id: 'u1' } },
                { rotatedAt: null },
            );
            // Sin esto, el access token seguiría sirviendo hasta 15 minutos más.
            expect(user.sessionsRevokedAt).toBeInstanceOf(Date);
        });

        it('no da de baja la cuenta: sigue activa', async () => {
            const user = makeUser({ isActive: true });
            repo.findOne.mockResolvedValue(user);
            refreshRepo.update.mockResolvedValue({ affected: 1 });

            await service.revokeSessions('u1', requester);

            expect(user.isActive).toBe(true);
            expect(user.status).toBe(UserStatus.ACTIVO);
        });

        it('no permite cerrarse las propias sesiones', async () => {
            await expect(
                service.revokeSessions(requester.id, requester),
            ).rejects.toThrow(ConflictException);
            expect(refreshRepo.update).not.toHaveBeenCalled();
        });

        it('devuelve 0 si no había ninguna sesión abierta', async () => {
            repo.findOne.mockResolvedValue(makeUser());
            refreshRepo.update.mockResolvedValue({ affected: 0 });

            await expect(service.revokeSessions('u1', requester)).resolves.toBe(
                0,
            );
        });
    });

    describe('eliminar invitación pendiente', () => {
        it('borra una invitación que nunca fue aceptada', async () => {
            const pendiente = makeUser({ isActive: false, password: null });
            repo.findOne.mockResolvedValue(pendiente);

            await service.deletePendingInvitation('u1');

            expect(repo.remove).toHaveBeenCalledWith(pendiente);
        });

        it.each([
            ['activa', { isActive: true }],
            ['desactivada', { isActive: false, password: 'hash' }],
        ])('no borra una cuenta %s: se desactiva, no se elimina', async (
            _caso,
            campos,
        ) => {
            repo.findOne.mockResolvedValue(makeUser(campos));

            await expect(service.deletePendingInvitation('u1')).rejects.toThrow(
                ConflictException,
            );
            expect(repo.remove).not.toHaveBeenCalled();
        });

        it('falla si el usuario no existe', async () => {
            repo.findOne.mockResolvedValue(null);
            await expect(service.deletePendingInvitation('u1')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('cambiar roles', () => {
        it('no permite cambiarse los propios roles', async () => {
            await expect(
                service.updateRoles(requester.id, [UserRoles.USER], requester),
            ).rejects.toThrow(ConflictException);
            expect(repo.findOne).not.toHaveBeenCalled();
        });

        it('no permite quitarle admin al último que queda activo', async () => {
            otrosAdminsActivos = 0;
            repo.findOne.mockResolvedValue(
                makeUser({ roles: [UserRoles.ADMIN], isActive: true }),
            );

            await expect(
                service.updateRoles('u1', [UserRoles.RRHH], requester),
            ).rejects.toThrow(ConflictException);
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('permite quitarle admin si queda otro activo', async () => {
            otrosAdminsActivos = 1;
            repo.findOne.mockResolvedValue(
                makeUser({ roles: [UserRoles.ADMIN], isActive: true }),
            );

            const resultado = await service.updateRoles(
                'u1',
                [UserRoles.RRHH],
                requester,
            );

            expect(resultado.roles).toEqual([UserRoles.RRHH]);
        });

        it('no cuenta como pérdida de admin si la cuenta ya estaba inactiva', async () => {
            otrosAdminsActivos = 0;
            repo.findOne.mockResolvedValue(
                makeUser({ roles: [UserRoles.ADMIN], isActive: false }),
            );

            const resultado = await service.updateRoles(
                'u1',
                [UserRoles.USER],
                requester,
            );

            expect(resultado.roles).toEqual([UserRoles.USER]);
        });

        it('descarta los roles repetidos', async () => {
            repo.findOne.mockResolvedValue(makeUser());

            const resultado = await service.updateRoles(
                'u1',
                [UserRoles.RRHH, UserRoles.RRHH, UserRoles.USER],
                requester,
            );

            expect(resultado.roles).toEqual([UserRoles.RRHH, UserRoles.USER]);
        });
    });
});
