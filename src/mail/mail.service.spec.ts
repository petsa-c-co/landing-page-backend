import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import {
    MAIL_PROVIDER,
    OutgoingMail,
} from './providers/mail-provider.interface';

const CONFIG: Record<string, string> = {
    FRONTEND_URL: 'https://petrogassa.com/',
    CONTACT_INBOX_EMAIL: 'contacto@petrogassa.com',
};

describe('MailService (contenido y delegación al proveedor)', () => {
    let service: MailService;
    let send: jest.Mock;
    // Último correo que se le pasó al proveedor.
    const sent = (): OutgoingMail => {
        const calls = send.mock.calls as OutgoingMail[][];
        return calls[calls.length - 1][0];
    };

    beforeEach(async () => {
        send = jest.fn().mockResolvedValue(true);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MailService,
                {
                    provide: MAIL_PROVIDER,
                    useValue: { name: 'Fake', send },
                },
                {
                    provide: ConfigService,
                    useValue: { get: (k: string) => CONFIG[k] },
                },
            ],
        }).compile();

        service = module.get<MailService>(MailService);
    });

    describe('activación', () => {
        it('arma el enlace del frontend sin barra duplicada y usa idempotencia', async () => {
            await expect(
                service.sendActivationEmail('nuevo@x.com', 'tok-123'),
            ).resolves.toBe(true);

            const mail = sent();
            expect(mail.to).toBe('nuevo@x.com');
            expect(mail.html).toContain(
                'https://petrogassa.com/activate?token=tok-123',
            );
            expect(mail.idempotencyKey).toBe('activate-account/tok-123');
        });
    });

    describe('reset de contraseña', () => {
        it('escapa el nombre del usuario (anti inyección de HTML)', async () => {
            await service.sendPasswordResetEmail(
                'user@x.com',
                'tok-reset',
                '<script>alert(1)</script>',
            );

            const mail = sent();
            expect(mail.html).not.toContain('<script>');
            expect(mail.html).toContain('&lt;script&gt;');
            expect(mail.html).toContain(
                'https://petrogassa.com/reset-password?token=tok-reset',
            );
        });
    });

    describe('notificación de contacto', () => {
        const message = {
            id: 'msg-1',
            name: 'Juan <b>Pérez</b>',
            email: 'juan@x.com',
            phone: null,
            subject: 'Consulta',
            message: 'Hola\nsegunda línea',
        };

        it('va al buzón de la empresa y responde al remitente', async () => {
            await service.sendContactNotification(message);

            const mail = sent();
            expect(mail.to).toBe('contacto@petrogassa.com');
            expect(mail.replyTo).toBe('juan@x.com');
            expect(mail.fromName).toBe('Petrogassa Web');
            expect(mail.idempotencyKey).toBe('contact-message/msg-1');
        });

        it('escapa los campos del formulario y respeta los saltos de línea', async () => {
            await service.sendContactNotification(message);

            const mail = sent();
            expect(mail.html).toContain('Juan &lt;b&gt;Pérez&lt;/b&gt;');
            expect(mail.html).toContain('Hola<br>segunda línea');
        });

        it('ofrece un botón de respuesta con el asunto precargado', async () => {
            await service.sendContactNotification(message);

            const mail = sent();
            expect(mail.html).toContain(
                `mailto:${encodeURIComponent('juan@x.com')}?subject=${encodeURIComponent('Re: Consulta')}`,
            );
        });

        it('recorta el nombre del botón sin partir entidades HTML', async () => {
            await service.sendContactNotification({
                ...message,
                name: 'Juan Ignacio <b>Pérez</b> de la Torre y Vega',
            });

            // El recorte ocurre sobre el nombre crudo, así que toda entidad
            // que sobreviva tiene que estar completa.
            const boton = /Responder a ([^<]*)</.exec(sent().html)?.[1] ?? '';
            expect(boton.endsWith('…')).toBe(true);
            expect(boton).not.toMatch(/&[a-z]+$|&[a-z]+…$/);
            expect(boton).toContain('&lt;b&gt;');
        });

        it('enlaza el teléfono solo cuando el formulario lo trae', async () => {
            // El pie institucional siempre lleva enlaces tel: con los números
            // de la empresa, así que se mira puntualmente la celda del dato.
            const celdaTelefono = (html: string): string =>
                /<td[^>]*>Teléfono<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/.exec(
                    html,
                )?.[1] ?? '';

            await service.sendContactNotification(message);
            expect(celdaTelefono(sent().html)).toBe('—');

            await service.sendContactNotification({
                ...message,
                phone: '299-4123456',
            });
            expect(celdaTelefono(sent().html)).toContain(
                'href="tel:299-4123456"',
            );
        });

        it('no envía nada si falta el buzón configurado', async () => {
            const module = await Test.createTestingModule({
                providers: [
                    MailService,
                    { provide: MAIL_PROVIDER, useValue: { name: 'F', send } },
                    {
                        provide: ConfigService,
                        useValue: { get: (): undefined => undefined },
                    },
                ],
            }).compile();

            const isolated = module.get<MailService>(MailService);
            await expect(
                isolated.sendContactNotification(message),
            ).resolves.toBe(false);
            expect(send).not.toHaveBeenCalled();
        });
    });

    describe('banners embebidos', () => {
        const casos: [string, () => Promise<boolean>][] = [
            [
                'activación',
                (): Promise<boolean> =>
                    service.sendActivationEmail('a@x.com', 't'),
            ],
            [
                'reset',
                (): Promise<boolean> =>
                    service.sendPasswordResetEmail('a@x.com', 't', 'Ana'),
            ],
            [
                'contacto',
                (): Promise<boolean> =>
                    service.sendContactNotification({
                        id: 'm',
                        name: 'Ana',
                        email: 'a@x.com',
                        phone: null,
                        subject: null,
                        message: 'hola',
                    }),
            ],
        ];

        it.each(casos)('el correo de %s lleva su banner referenciado por cid', async (
            _nombre,
            enviar,
        ) => {
            await enviar();

            const mail = sent();
            expect(mail.inlineImages).toHaveLength(1);
            const img = mail.inlineImages![0];
            expect(img.contentType).toBe('image/jpeg');
            expect(img.content.length).toBeGreaterThan(0);
            // El HTML tiene que apuntar a la imagen que viaja adjunta.
            expect(mail.html).toContain(`src="cid:${img.cid}"`);
        });
    });

    it('propaga el fallo del proveedor como false, sin lanzar', async () => {
        send.mockResolvedValue(false);
        await expect(
            service.sendActivationEmail('x@x.com', 'tok'),
        ).resolves.toBe(false);
    });
});
