import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import {
    MAIL_PROVIDER,
    MailProvider,
} from './providers/mail-provider.interface';
import { EnvialoSimpleProvider } from './providers/envialosimple.provider';
import { ResendProvider } from './providers/resend.provider';

@Module({
    controllers: [],
    providers: [
        MailService,
        // Elige el proveedor de correo según MAIL_PROVIDER. Por defecto
        // EnvíaloSimple; 'resend' queda disponible sin tocar código.
        {
            provide: MAIL_PROVIDER,
            useFactory: (config: ConfigService): MailProvider =>
                config.get<string>('MAIL_PROVIDER') === 'resend'
                    ? new ResendProvider(config)
                    : new EnvialoSimpleProvider(config),
            inject: [ConfigService],
        },
    ],
    exports: [MailService],
})
export class MailModule {}
