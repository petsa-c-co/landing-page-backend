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

    /**
     * Momento en que este token se consumió PARA ROTARLO. Es la referencia de
     * la ventana de gracia ante reutilizaciones (ver RefreshTokenService).
     *
     * OJO: se marca únicamente en la rotación. Las revocaciones por logout, por
     * cambio de contraseña o por acción de un administrador dejan este campo en
     * null a propósito, para que nunca puedan caer dentro de la ventana y
     * "revivir" una sesión que se quiso cortar.
     */
    @Column({ type: 'timestamp', nullable: true })
    rotatedAt: Date | null;

    @ManyToOne(() => User, (user) => user.refreshTokens, {
        onDelete: 'CASCADE',
    })
    user: User;
}
