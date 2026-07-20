import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { VerificationToken } from '../entities/verification-token.entity';

// Cada cuánto se purgan los tokens EXPIRADOS. Los tokens revocados pero aún
// vigentes NO se borran: son la evidencia que usa la detección de reutilización.
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TokenCleanupService.name);
    private timer?: NodeJS.Timeout;

    constructor(
        @InjectRepository(RefreshToken)
        private readonly refreshTokenRepository: Repository<RefreshToken>,
        @InjectRepository(VerificationToken)
        private readonly verificationTokenRepository: Repository<VerificationToken>,
    ) {}

    onModuleInit(): void {
        this.timer = setInterval(
            () => void this.cleanupExpired(),
            CLEANUP_INTERVAL_MS,
        );
        void this.cleanupExpired();
    }

    onModuleDestroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    async cleanupExpired(): Promise<void> {
        try {
            const now = new Date();
            const [refresh, verification] = await Promise.all([
                this.refreshTokenRepository.delete({
                    expiresAt: LessThan(now),
                }),
                this.verificationTokenRepository.delete({
                    expiresAt: LessThan(now),
                }),
            ]);
            const total =
                (refresh.affected ?? 0) + (verification.affected ?? 0);
            if (total > 0) {
                this.logger.log(`Tokens expirados purgados: ${total}`);
            }
        } catch (err) {
            this.logger.error(
                'Fallo al purgar tokens expirados',
                err instanceof Error ? err.stack : String(err),
            );
        }
    }
}
