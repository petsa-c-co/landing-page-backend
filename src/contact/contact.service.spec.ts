import { Repository } from 'typeorm';
import { ContactService } from './contact.service';
import { ContactMessage } from './entities/contact-message.entity';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { MailService } from '@/mail/mail.service';

describe('ContactService', () => {
    let service: ContactService;
    let repo: { create: jest.Mock; save: jest.Mock };
    let mail: { sendContactNotification: jest.Mock };

    const mensaje = (
        extra: Partial<CreateContactMessageDto> = {},
    ): CreateContactMessageDto => ({
        name: 'Nicolás Pérez',
        email: 'nico@example.com',
        message: 'Quisiera consultar por el servicio de transporte.',
        ...extra,
    });

    beforeEach(() => {
        repo = {
            create: jest.fn((d: Partial<ContactMessage>) => d),
            save: jest.fn((d: Partial<ContactMessage>) =>
                Promise.resolve({ ...d, id: 'msg-1' }),
            ),
        };
        mail = { sendContactNotification: jest.fn().mockResolvedValue(true) };
        service = new ContactService(
            repo as unknown as Repository<ContactMessage>,
            mail as unknown as MailService,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('alta pública', () => {
        it('guarda el mensaje y dispara la notificación', async () => {
            await expect(service.create(mensaje())).resolves.toEqual({
                id: 'msg-1',
            });

            expect(repo.save).toHaveBeenCalled();
            expect(mail.sendContactNotification).toHaveBeenCalled();
        });

        it('la notificación es best-effort: si falla, el mensaje igual queda', async () => {
            const error = jest
                .spyOn(
                    (service as unknown as { logger: { error: () => void } })
                        .logger,
                    'error',
                )
                .mockImplementation(() => undefined);
            mail.sendContactNotification.mockRejectedValue(new Error('caído'));

            await expect(service.create(mensaje())).resolves.toEqual({
                id: 'msg-1',
            });
            expect(repo.save).toHaveBeenCalled();
            await new Promise((resolver) => process.nextTick(resolver));
            expect(error).toHaveBeenCalled();
        });
    });

    /**
     * El campo `referencia` está oculto en el formulario y sin acceso por
     * teclado: una persona no puede completarlo. Que venga con algo es la única
     * señal que tenemos de que del otro lado hay un bot.
     */
    describe('campo trampa (honeypot)', () => {
        beforeEach(() => {
            jest.spyOn(
                (service as unknown as { logger: { warn: () => void } }).logger,
                'warn',
            ).mockImplementation(() => undefined);
        });

        it('no guarda ni notifica cuando el campo trampa viene completo', async () => {
            await service.create(mensaje({ referencia: 'http://spam.example' }));

            expect(repo.save).not.toHaveBeenCalled();
            expect(mail.sendContactNotification).not.toHaveBeenCalled();
        });

        /**
         * Devolver un error le avisaría al bot que lo detectamos y probaría
         * otra cosa. Un "gracias" lo manda contento a la próxima víctima.
         */
        it('responde como si hubiera salido bien, con un id verosímil', async () => {
            const respuesta = await service.create(
                mensaje({ referencia: 'x' }),
            );

            expect(respuesta.id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            );
        });

        it('no deja rastro del envío en el log, por si fuera un falso positivo', async () => {
            const warn = jest.spyOn(
                (service as unknown as { logger: { warn: jest.Mock } }).logger,
                'warn',
            );

            await service.create(
                mensaje({ referencia: 'x', name: 'Persona Real' }),
            );

            const textos = warn.mock.calls.flat().join(' ');
            expect(textos).not.toContain('Persona Real');
            expect(textos).not.toContain('nico@example.com');
        });

        it('el campo vacío es un envío normal, no un bot', async () => {
            await service.create(mensaje({ referencia: '' }));

            expect(repo.save).toHaveBeenCalled();
        });

        // El campo no es una columna: si se colara al create() del repositorio,
        // quedaría una propiedad fantasma en la entidad.
        it('nunca llega a la entidad que se persiste', async () => {
            await service.create(mensaje({ referencia: '' }));

            const [datos] = repo.create.mock.calls[0] as [
                Record<string, unknown>,
            ];
            expect(datos).not.toHaveProperty('referencia');
        });
    });
});
