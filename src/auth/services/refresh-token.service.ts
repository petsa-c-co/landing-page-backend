import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { ConfigService } from '@nestjs/config';
import { User } from '@/users/entities/user.entity';
import { CreateRefreshTokenResponse } from '../interfaces/create-refresh-token.response';
import { generateOpaqueToken, hashToken } from '@/common/utils/token.util';

@Injectable()
export class RefreshTokenService {
    private readonly logger = new Logger(RefreshTokenService.name);

    constructor(
        @InjectRepository(RefreshToken)
        private readonly refreshTokenRepository: Repository<RefreshToken>,
        private readonly configService: ConfigService,
    ) {}

    async create(user: User): Promise<CreateRefreshTokenResponse> {
        // El valor crudo solo vive en la cookie del cliente; en DB va el hash.
        const rawToken = generateOpaqueToken();

        const expiresDays =
            this.configService.get<number>('REFRESH_TOKEN_EXPIRES_IN_DAYS') ??
            7;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresDays);

        const savedRefreshToken = await this.refreshTokenRepository.save({
            token: hashToken(rawToken),
            user,
            expiresAt,
        });

        return {
            token: rawToken,
            expiresAt: savedRefreshToken.expiresAt,
        };
    }

    /**
     * Valida y consume (revoca) un refresh token para su rotación. El claim
     * isRevoked false->true es atómico: si dos requests concurrentes presentan
     * el mismo token, solo uno rota; el otro cae en la rama de reutilización.
     */
    async consume(rawToken: string): Promise<RefreshToken> {
        const refreshToken = await this.refreshTokenRepository.findOne({
            where: { token: hashToken(rawToken) },
            relations: { user: true },
        });

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token no válido');
        }

        if (refreshToken.expiresAt < new Date()) {
            throw new UnauthorizedException('Refresh token expirado');
        }

        const claimed = await this.refreshTokenRepository.update(
            { id: refreshToken.id, isRevoked: false },
            { isRevoked: true },
        );

        // Un refresh token ya rotado (revocado) que vuelve a presentarse indica
        // robo probable. Se revocan TODAS las sesiones del usuario para cortar
        // al atacante y al cliente legítimo.
        if (!claimed.affected) {
            this.logger.warn(
                `Reutilización de refresh token detectada para el usuario ${refreshToken.user.id}; se revocan todas sus sesiones`,
            );
            await this.revokeAllByUser(refreshToken.user);
            throw new UnauthorizedException(
                'Sesión inválida, por favor vuelve a iniciar sesión',
            );
        }

        return refreshToken;
    }

    /**
     * Revoca un token por su valor crudo. Idempotente: revocar un token ya
     * revocado o inexistente no lanza error (necesario para logout robusto).
     */
    async revoke(rawToken: string): Promise<void> {
        await this.refreshTokenRepository.update(
            { token: hashToken(rawToken) },
            { isRevoked: true },
        );
    }

    async revokeAllByUser(user: User): Promise<void> {
        await this.refreshTokenRepository.update(
            {
                user: { id: user.id },
                isRevoked: false,
            },
            { isRevoked: true },
        );
    }
}
