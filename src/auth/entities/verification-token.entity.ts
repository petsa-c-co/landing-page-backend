import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '@/users/entities/user.entity';

export enum VerificationTokenType {
    // Alta de cuenta por invitación: el usuario define nombre, apellido y
    // contraseña al activarse (reemplaza al viejo flujo de auto-verificación).
    ACCOUNT_ACTIVATION = 'account-activation',
    PASSWORD_RESET = 'password-reset',
}

@Entity('verification_tokens')
export class VerificationToken extends BaseEntity {
    // Se almacena el hash SHA-256 del token, nunca el valor crudo.
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    token: string;

    @Column({
        type: 'enum',
        enum: VerificationTokenType,
    })
    type: VerificationTokenType;

    @Column({ type: 'timestamp' })
    expiresAt: Date;

    @Column({ type: 'boolean', default: false })
    isUsed: boolean;

    @ManyToOne(() => User, (user) => user.verificationTokens, {
        onDelete: 'CASCADE',
    })
    user: User;
}
