import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    VerificationToken,
    VerificationTokenType,
} from '../entities/verification-token.entity';
import { User } from '@/users/entities/user.entity';
import { ConfigService } from '@nestjs/config';
import { generateOpaqueToken, hashToken } from '@/common/utils/token.util';
import { CreateVerificationTokenResponse } from '../interfaces/create-verification-token.response';

@Injectable()
export class VerificationTokenService {
    constructor(
        @InjectRepository(VerificationToken)
        private readonly verificationTokenRepository: Repository<VerificationToken>,
        private readonly configService: ConfigService,
    ) {}

    // Crea un nuevo token de verificación. Devuelve el valor CRUDO (para el
    // enlace del correo; token opaco de 256 bits, igual que los refresh
    // tokens); en la base de datos solo se guarda su hash SHA-256.
    async create(
        user: User,
        type: VerificationTokenType,
    ): Promise<CreateVerificationTokenResponse> {
        const rawToken = generateOpaqueToken();

        // La activación de cuenta (invitación) dura más que un reset, porque el
        // usuario puede tardar en abrir el correo.
        const expiresHours =
            type === VerificationTokenType.ACCOUNT_ACTIVATION
                ? (this.configService.get<number>(
                      'ACCOUNT_ACTIVATION_TOKEN_EXPIRES_IN_HOURS',
                  ) ?? 48)
                : (this.configService.get<number>(
                      'VERIFICATION_TOKEN_EXPIRES_IN_HOURS',
                  ) ?? 1);

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiresHours);

        const verificationToken = this.verificationTokenRepository.create({
            token: hashToken(rawToken),
            type,
            user,
            expiresAt,
        });

        const saved =
            await this.verificationTokenRepository.save(verificationToken);

        return { token: rawToken, expiresAt: saved.expiresAt };
    }

    async validate(
        rawToken: string,
        type: VerificationTokenType,
    ): Promise<VerificationToken> {
        const verificationToken =
            await this.verificationTokenRepository.findOne({
                where: { token: hashToken(rawToken), type },
                relations: { user: true },
            });

        if (!verificationToken) {
            throw new BadRequestException(
                'El token de verificación es inválido o no existe',
            );
        }

        if (verificationToken.isUsed) {
            throw new BadRequestException('Este token ya ha sido utilizado');
        }

        if (verificationToken.expiresAt < new Date()) {
            throw new BadRequestException(
                'El token ha expirado, por favor solicita uno nuevo',
            );
        }

        // Consumo atómico (un solo uso): si un request concurrente ya lo marcó
        // como usado entre el findOne y este update, affected es 0 y se rechaza.
        const claimed = await this.verificationTokenRepository.update(
            { id: verificationToken.id, isUsed: false },
            { isUsed: true },
        );

        if (!claimed.affected) {
            throw new BadRequestException('Este token ya ha sido utilizado');
        }

        verificationToken.isUsed = true;
        return verificationToken;
    }

    // Invalida todos los tokens no usados de un usuario (opcionalmente por tipo).
    async revokeAllByUser(
        user: User,
        type?: VerificationTokenType,
    ): Promise<void> {
        await this.verificationTokenRepository.update(
            {
                user: { id: user.id },
                type,
                isUsed: false,
            },
            { isUsed: true },
        );
    }
}
