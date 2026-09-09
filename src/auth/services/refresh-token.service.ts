import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { ConfigService } from '@nestjs/config';
import { User } from '@/users/entities/user.entity';
import { CreateRefreshTokenResponse } from '../interfaces/create-refresh-token.response';
import { generateOpaqueToken, hashToken } from '@/common/utils/token.util';

/**
 * Ventana durante la cual volver a presentar un token recién rotado se
 * interpreta como concurrencia y no como robo.
 *
 * El caso real: con varias pestañas del panel abiertas, los access tokens
 * vencen a la vez y salen dos refresh en paralelo. Ambos viajan con la misma
 * cookie porque el primero todavía no respondió; uno rota y el otro llega con
 * el token ya consumido. Sin esta ventana, ese choque cierra la sesión en todas
 * las pestañas.
 *
 * La carrera dura milisegundos, así que 10 segundos sobran de margen y dejan la
 * detección de robo intacta para cualquier reutilización posterior. Es el
 * patrón "refresh token reuse interval".
 */
const REUSE_GRACE_MS = 10_000;

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
            { isRevoked: true, rotatedAt: new Date() },
        );

        if (!claimed.affected) {
            return this.handleReuse(refreshToken);
        }

        return refreshToken;
    }

    /**
     * El token venía revocado. Se deja pasar SOLO si se rotó hace menos de
     * REUSE_GRACE_MS: eso es una carrera entre pestañas, no un replay.
     *
     * La otra mitad de la regla vive en las revocaciones —revoke(),
     * revokeAllByUser() y los cortes desde el panel—: todas anulan el rotatedAt
     * de los tokens de esa cuenta. Así, un cierre deliberado (logout, cambio de
     * contraseña, baja o cierre de sesiones por un admin) deja a la ventana sin
     * nada a lo que agarrarse, y acá alcanza con mirar un solo campo.
     *
     * Se probó, en su lugar, exigir que a la cuenta le quedara alguna sesión
     * viva. No sirve: el token sucesor se inserta DESPUÉS de que consume()
     * revoca el anterior, así que el pedido perdedor de una carrera legítima
     * cuenta cero y corta la sesión. Medido contra Postgres, arruinaba la
     * mayoría de los refrescos concurrentes.
     */
    private async handleReuse(refreshToken: RefreshToken): Promise<RefreshToken> {
        // Se relee para tomar el rotatedAt que escribió quien ganó la carrera.
        const actual = await this.refreshTokenRepository.findOne({
            where: { id: refreshToken.id },
        });

        const rotadoHace = actual?.rotatedAt
            ? Date.now() - actual.rotatedAt.getTime()
            : null;

        if (rotadoHace !== null && rotadoHace <= REUSE_GRACE_MS) {
            this.logger.debug(
                `Refresco concurrente del usuario ${refreshToken.user.id} (${rotadoHace} ms); se renueva sin cortar la sesión`,
            );
            return refreshToken;
        }

        this.logger.warn(
            `Reutilización de refresh token detectada para el usuario ${refreshToken.user.id}; se revocan todas sus sesiones`,
        );
        await this.revokeAllByUser(refreshToken.user);
        throw new UnauthorizedException(
            'Sesión inválida, por favor vuelve a iniciar sesión',
        );
    }

    /**
     * Revoca un token por su valor crudo (logout). Idempotente: revocar uno ya
     * revocado o inexistente no lanza error.
     *
     * Además anula el rotatedAt de los tokens que esa cuenta rotó hace poco. Sin
     * eso, el pase ANTERIOR de la sesión que se está cerrando conserva su
     * rotatedAt reciente y sigue siendo canjeable durante la ventana de gracia,
     * justo después de que el usuario pidió salir.
     */
    async revoke(rawToken: string): Promise<void> {
        const hash = hashToken(rawToken);
        const token = await this.refreshTokenRepository.findOne({
            where: { token: hash },
            relations: { user: true },
        });

        await this.refreshTokenRepository.update(
            { token: hash },
            { isRevoked: true },
        );

        if (!token) {
            return;
        }

        await this.refreshTokenRepository.update(
            {
                user: { id: token.user.id },
                rotatedAt: MoreThan(new Date(Date.now() - REUSE_GRACE_MS)),
            },
            { rotatedAt: null },
        );
    }

    /**
     * Corta todas las sesiones de una cuenta (reutilización detectada, cambio
     * de contraseña).
     *
     * No filtra por isRevoked a propósito: los tokens YA rotados también entran,
     * porque son justamente los que conservan el rotatedAt que habilita la
     * ventana de gracia. Dejarlos afuera era lo que permitía revivir una sesión
     * que se había cortado a propósito.
     */
    async revokeAllByUser(user: User): Promise<void> {
        await this.refreshTokenRepository.update(
            { user: { id: user.id } },
            { isRevoked: true, rotatedAt: null },
        );
    }
}
