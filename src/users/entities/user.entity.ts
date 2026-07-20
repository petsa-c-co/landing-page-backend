import { BaseEntity } from '@/common/entities/base.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { VerificationToken } from '@/auth/entities/verification-token.entity';
import { RefreshToken } from '@/auth/entities/refresh-token.entity';
import { Exclude } from 'class-transformer';

@Entity('users')
export class User extends BaseEntity {
    // name/surname/password quedan NULL mientras la cuenta está pendiente de
    // activación (invitada o sembrada); el usuario los define al activarse.
    @Column({ type: 'varchar', length: 25, nullable: true })
    name: string | null;

    @Column({ type: 'varchar', length: 25, nullable: true })
    surname: string | null;

    // 254 es el largo máximo de un email según RFC 5321 (y lo que acepta
    // @IsEmail); debe coincidir con el @MaxLength de los DTOs.
    @Column({ type: 'varchar', length: 254, unique: true, nullable: false })
    email: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    @Exclude()
    password: string | null;

    // Fecha del último cambio de contraseña. Los access tokens emitidos antes
    // de esta fecha se rechazan en JwtStrategy (cierra la ventana post-reset).
    @Column({ type: 'timestamp', nullable: true })
    @Exclude()
    passwordChangedAt: Date | null;

    @Column({ type: 'boolean', default: false })
    isActive: boolean;

    @Column({
        type: 'text',
        array: true,
        nullable: false,
        default: [UserRoles.USER],
    })
    roles: UserRoles[];

    @Column({ type: 'boolean', default: false })
    isEmailVerified: boolean;

    @OneToMany(
        () => VerificationToken,
        (verificationToken) => verificationToken.user,
    )
    verificationTokens: VerificationToken[];

    @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
    refreshTokens: RefreshToken[];
}
