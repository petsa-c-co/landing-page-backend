import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { VerificationToken } from './entities/verification-token.entity';
import { UsersModule } from '@/users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { VerificationTokenService } from './services/verification-token.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { TokenCleanupService } from './services/token-cleanup.service';
import { AdminSeedService } from './services/admin-seed.service';
import { MailModule } from '@/mail/mail.module';
import { JWT_AUDIENCE, JWT_ISSUER } from './auth.constants';

@Module({
    imports: [
        TypeOrmModule.forFeature([RefreshToken, VerificationToken]),
        UsersModule,
        MailModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get('JWT_SECRET'),
                signOptions: {
                    expiresIn: configService.get('JWT_ACCESS_TOKEN_EXPIRES_IN'),
                    issuer: JWT_ISSUER,
                    audience: JWT_AUDIENCE,
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        JwtStrategy,
        VerificationTokenService,
        RefreshTokenService,
        TokenCleanupService,
        AdminSeedService,
    ],
    exports: [AuthService, TypeOrmModule, JwtStrategy, PassportModule],
})
export class AuthModule {}
