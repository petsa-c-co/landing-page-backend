import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '@/users/users.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { VerificationTokenService } from './services/verification-token.service';
import { MailService } from '@/mail/mail.service';

describe('AuthService', () => {
    let service: AuthService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: UsersService, useValue: {} },
                { provide: JwtService, useValue: {} },
                { provide: RefreshTokenService, useValue: {} },
                { provide: VerificationTokenService, useValue: {} },
                { provide: MailService, useValue: {} },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
