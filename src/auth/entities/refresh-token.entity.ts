import { User } from '@/users/entities/user.entity';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
    // Se almacena el hash SHA-256 del token, nunca el valor crudo.
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    token: string;

    @Column({ type: 'timestamp' })
    expiresAt: Date;

    @Column({ type: 'boolean', default: false })
    isRevoked: boolean;

    @ManyToOne(() => User, (user) => user.refreshTokens, {
        onDelete: 'CASCADE',
    })
    user: User;
}
