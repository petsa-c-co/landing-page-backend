import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { RefreshToken } from '@/auth/entities/refresh-token.entity';

@Module({
    // RefreshToken se registra acá para poder revocar las sesiones al
    // desactivar una cuenta sin depender de AuthModule (ver UsersService).
    imports: [TypeOrmModule.forFeature([User, RefreshToken])],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule {}
