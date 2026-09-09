import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '@/users/entities/user.entity';
import { UserRoles } from './enum/user-roles.enum';
import { UserStatus } from '@/users/enum/user-status.enum';

describe('AuthController', () => {
    let controller: AuthController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [
                { provide: AuthService, useValue: {} },
                { provide: ConfigService, useValue: { get: jest.fn() } },
            ],
        }).compile();

        controller = module.get<AuthController>(AuthController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    // El panel decide qué menú mostrar con lo que devuelve este endpoint: si
    // dejara de exponer los roles, el frontend se quedaría sin forma de saberlo
    // (las cookies son httpOnly).
    it('GET /auth/me devuelve el usuario de la sesión con sus roles', () => {
        const user = Object.assign(new User(), {
            id: 'u1',
            email: 'ana@x.com',
            name: 'Ana',
            surname: 'Pérez',
            password: 'hash',
            isActive: true,
            roles: [UserRoles.RRHH],
        });

        const resultado = controller.me(user);

        expect(resultado.roles).toEqual([UserRoles.RRHH]);
        expect(resultado.id).toBe('u1');
        expect(resultado.status).toBe(UserStatus.ACTIVO);
    });
});
