import { ConfigService } from '@nestjs/config';
import { ResendProvider } from './resend.provider';
import { OutgoingMail } from './mail-provider.interface';

const enviar = jest.fn();
jest.mock('resend', () => ({
    Resend: jest.fn().mockImplementation(() => ({
        emails: { send: enviar },
    })),
}));

/**
 * Resend no es el proveedor activo (lo es EnvíaloSimple), pero el README lo
 * documenta como intercambiable con solo cambiar MAIL_PROVIDER. Estos tests
 * fijan que ese cambio no degrade los correos en silencio: sin ellos, el
 * defecto que motivó este archivo —el banner saliendo como archivo adjunto en
 * vez de en el cuerpo— solo se descubría mirando un correo recibido.
 */
describe('ResendProvider', () => {
    let provider: ResendProvider;

    const banner = {
        cid: 'banner-bienvenida',
        filename: 'banner-bienvenida.jpg',
        content: Buffer.from('bytes-del-jpg'),
        contentType: 'image/jpeg',
    };

    const correo: OutgoingMail = {
        to: 'destino@example.com',
        subject: 'Bienvenido',
        html: '<img src="cid:banner-bienvenida">',
        inlineImages: [banner],
    };

    const adjuntoEnviado = (): Record<string, unknown> => {
        const [payload] = enviar.mock.calls[0] as [
            { attachments?: Record<string, unknown>[] },
        ];
        return payload.attachments![0];
    };

    beforeEach(() => {
        enviar.mockReset().mockResolvedValue({ data: { id: 'e1' }, error: null });
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        provider = new ResendProvider({
            get: () => 'api-key-de-prueba',
        } as unknown as ConfigService);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /**
     * `contentId` es lo que distingue una imagen embebida de un archivo suelto.
     * Sin él, el `cid:` del HTML no resuelve: el lector ve el correo sin banner
     * y con un adjunto que nadie pidió.
     */
    it('manda el banner como imagen EMBEBIDA, no como archivo adjunto', async () => {
        await provider.send(correo);

        expect(adjuntoEnviado()).toMatchObject({
            contentId: 'banner-bienvenida',
            filename: 'banner-bienvenida.jpg',
        });
    });

    it('declara el tipo en vez de dejar que lo deduzcan del nombre', async () => {
        await provider.send(correo);

        expect(adjuntoEnviado().contentType).toBe('image/jpeg');
    });

    it('manda el contenido tal cual, sin recodificar', async () => {
        await provider.send(correo);

        expect(adjuntoEnviado().content).toBe(banner.content);
    });

    it('un correo sin imágenes no lleva la clave attachments', async () => {
        await provider.send({ ...correo, inlineImages: undefined });

        const [payload] = enviar.mock.calls[0] as [Record<string, unknown>];
        expect(payload).not.toHaveProperty('attachments');
    });

    it('pasa la clave de idempotencia, que es lo que este proveedor aporta', async () => {
        await provider.send({ ...correo, idempotencyKey: 'clave-1' });

        const [, opciones] = enviar.mock.calls[0] as [
            unknown,
            { idempotencyKey?: string } | undefined,
        ];
        expect(opciones?.idempotencyKey).toBe('clave-1');
    });

    it('un rechazo del proveedor devuelve false y queda en el log', async () => {
        const error = jest
            .spyOn(
                (provider as unknown as { logger: { error: () => void } }).logger,
                'error',
            )
            .mockImplementation(() => undefined);
        enviar.mockResolvedValue({
            data: null,
            error: { name: 'validation_error', message: 'dominio no verificado' },
        });

        await expect(provider.send(correo)).resolves.toBe(false);
        expect(error).toHaveBeenCalled();
    });
});
