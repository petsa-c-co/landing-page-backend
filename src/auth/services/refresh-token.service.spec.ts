import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '@/users/entities/user.entity';
import { hashToken } from '@/common/utils/token.util';

const CRUDO = 'token-crudo-de-prueba';

const makeToken = (over: Partial<RefreshToken> = {}): RefreshToken =>
    ({
        id: 'rt1',
        token: hashToken(CRUDO),
        // Vence dentro de una semana.
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        isRevoked: false,
        rotatedAt: null,
        user: { id: 'u1' } as User,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...over,
    });

describe('RefreshTokenService (rotación y detección de reutilización)', () => {
    let service: RefreshTokenService;
    let repo: {
        findOne: jest.Mock;
        update: jest.Mock;
        save: jest.Mock;
    };

    beforeEach(() => {
        repo = {
            findOne: jest.fn(),
            update: jest.fn(),
            save: jest.fn((t: RefreshToken) => Promise.resolve(t)),
        };
        service = new RefreshTokenService(
            repo as unknown as Repository<RefreshToken>,
            { get: (): number => 7 } as unknown as ConfigService,
        );
    });

    it('rota un token válido y deja constancia del momento', async () => {
        repo.findOne.mockResolvedValueOnce(makeToken());
        repo.update.mockResolvedValueOnce({ affected: 1 });

        await expect(service.consume(CRUDO)).resolves.toMatchObject({
            id: 'rt1',
        });

        const [criterio, cambios] = repo.update.mock.calls[0] as [
            Record<string, unknown>,
            Record<string, unknown>,
        ];
        expect(criterio).toEqual({ id: 'rt1', isRevoked: false });
        expect(cambios.isRevoked).toBe(true);
        expect(cambios.rotatedAt).toBeInstanceOf(Date);
    });

    describe('reutilización de un token ya rotado', () => {
        // El claim atómico no afecta ninguna fila: alguien lo rotó antes.
        const perdioLaCarrera = (): void => {
            repo.findOne.mockResolvedValueOnce(makeToken());
            repo.update.mockResolvedValueOnce({ affected: 0 });
        };

        it('dentro de la ventana lo trata como refresco concurrente y NO corta la sesión', async () => {
            perdioLaCarrera();
            // Otra pestaña lo rotó hace 300 ms.
            repo.findOne.mockResolvedValueOnce(
                makeToken({
                    isRevoked: true,
                    rotatedAt: new Date(Date.now() - 300),
                }),
            );

            await expect(service.consume(CRUDO)).resolves.toMatchObject({
                id: 'rt1',
            });
            // No debe haberse revocado nada más.
            expect(repo.update).toHaveBeenCalledTimes(1);
        });

        /**
         * La versión anterior de este arreglo exigía además que a la cuenta le
         * quedara alguna sesión viva. Medido contra Postgres, cortaba la sesión
         * en la mayoría de los refrescos concurrentes: el token sucesor se
         * inserta DESPUÉS de que consume() revoca el anterior, así que el
         * pedido perdedor contaba cero. La regla vive ahora en las
         * revocaciones, que anulan el rotatedAt (ver los tests de abajo).
         */
        it('dentro de la ventana no consulta si quedan sesiones vivas', async () => {
            perdioLaCarrera();
            repo.findOne.mockResolvedValueOnce(
                makeToken({
                    isRevoked: true,
                    rotatedAt: new Date(Date.now() - 300),
                }),
            );

            await expect(service.consume(CRUDO)).resolves.toBeTruthy();
            // Solo el claim atómico: ninguna revocación extra.
            expect(repo.update).toHaveBeenCalledTimes(1);
        });

        it('fuera de la ventana asume robo y revoca todas las sesiones', async () => {
            perdioLaCarrera();
            // Rotado hace un minuto: ya no es concurrencia.
            repo.findOne.mockResolvedValueOnce(
                makeToken({
                    isRevoked: true,
                    rotatedAt: new Date(Date.now() - 60_000),
                }),
            );
            repo.update.mockResolvedValueOnce({ affected: 3 });

            await expect(service.consume(CRUDO)).rejects.toThrow(
                UnauthorizedException,
            );
            expect(repo.update).toHaveBeenLastCalledWith(
                { user: { id: 'u1' } },
                { isRevoked: true, rotatedAt: null },
            );
        });

        it('sin rotatedAt (logout, cambio de clave o cierre por un admin) revoca todo', async () => {
            perdioLaCarrera();
            // Revocado por otra vía: rotatedAt sigue en null a propósito, así
            // que la ventana de gracia no puede revivir la sesión.
            repo.findOne.mockResolvedValueOnce(
                makeToken({ isRevoked: true, rotatedAt: null }),
            );
            repo.update.mockResolvedValueOnce({ affected: 2 });

            await expect(service.consume(CRUDO)).rejects.toThrow(
                UnauthorizedException,
            );
            expect(repo.update).toHaveBeenCalledTimes(2);
        });
    });

    it('rechaza un token vencido sin tocar la base', async () => {
        repo.findOne.mockResolvedValueOnce(
            makeToken({ expiresAt: new Date(Date.now() - 1000) }),
        );

        await expect(service.consume(CRUDO)).rejects.toThrow(
            UnauthorizedException,
        );
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('rechaza un token inexistente', async () => {
        repo.findOne.mockResolvedValueOnce(null);

        await expect(service.consume('cualquiera')).rejects.toThrow(
            UnauthorizedException,
        );
    });

    /**
     * La mitad de la regla que hace innecesario contar sesiones vivas: cortar
     * una sesión a propósito tiene que borrar la marca de rotación, o el pase
     * anterior sigue entrando por la ventana de gracia.
     */
    describe('cortar una sesión anula la ventana de gracia', () => {
        it('el logout borra el rotatedAt de lo que esa cuenta rotó recién', async () => {
            repo.findOne.mockResolvedValueOnce(makeToken());
            repo.update.mockResolvedValue({ affected: 1 });

            await service.revoke(CRUDO);

            const [criterio, cambios] = repo.update.mock.calls[1] as [
                Record<string, unknown>,
                Record<string, unknown>,
            ];
            expect(criterio).toMatchObject({ user: { id: 'u1' } });
            expect(criterio.rotatedAt).toBeDefined();
            expect(cambios).toEqual({ rotatedAt: null });
        });

        it('el logout de un token inexistente no toca nada más', async () => {
            repo.findOne.mockResolvedValueOnce(null);
            repo.update.mockResolvedValue({ affected: 0 });

            await service.revoke('cualquiera');

            expect(repo.update).toHaveBeenCalledTimes(1);
        });

        it('revokeAllByUser alcanza también a los tokens ya rotados', async () => {
            repo.update.mockResolvedValue({ affected: 4 });

            await service.revokeAllByUser({ id: 'u1' } as User);

            // Sin isRevoked:false en el criterio: si no, los ya rotados
            // conservaban su rotatedAt y la sesión revivía.
            expect(repo.update).toHaveBeenCalledWith(
                { user: { id: 'u1' } },
                { isRevoked: true, rotatedAt: null },
            );
        });
    });
});
