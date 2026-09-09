import { ConfigService } from '@nestjs/config';
import { EnvialoSimpleProvider } from './envialosimple.provider';
import { OutgoingMail } from './mail-provider.interface';

const configOf = (map: Record<string, string | undefined>): ConfigService =>
    ({ get: (key: string) => map[key] }) as unknown as ConfigService;

const CONFIGURED = {
    ENVIALOSIMPLE_API_KEY: 'es-key-123',
    ENVIALOSIMPLE_API_BASE_URL: 'https://api.envialosimple.email/api/v1',
    MAIL_FROM_EMAIL: 'no-reply@petrogassa.com',
    MAIL_FROM_NAME: 'Petrogassa',
};

const mail = (over: Partial<OutgoingMail> = {}): OutgoingMail => ({
    to: 'destino@x.com',
    subject: 'Asunto',
    html: '<p>hola</p>',
    ...over,
});

const response = (ok: boolean, status: number, body: unknown): Response =>
    ({
        ok,
        status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    }) as unknown as Response;

describe('EnvialoSimpleProvider', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        fetchSpy = jest.spyOn(globalThis, 'fetch');
    });
    afterEach(() => {
        fetchSpy.mockRestore();
    });

    const bodyOf = (): Record<string, unknown> => {
        const calls = fetchSpy.mock.calls as [string, { body: string }][];
        return JSON.parse(calls[0][1].body) as Record<string, unknown>;
    };

    it('envía al endpoint correcto con Bearer y payload en snake_case', async () => {
        fetchSpy.mockResolvedValue(
            response(true, 200, { queued: true, id: 'msg-1' }),
        );

        const ok = await new EnvialoSimpleProvider(
            configOf(CONFIGURED),
        ).send(mail({ replyTo: 'juan@x.com', previewText: 'adelanto' }));

        expect(ok).toBe(true);
        const [url, init] = fetchSpy.mock.calls[0] as [
            string,
            { headers: Record<string, string> },
        ];
        expect(url).toBe('https://api.envialosimple.email/api/v1/mail/send');
        expect(init.headers.Authorization).toBe('Bearer es-key-123');

        const body = bodyOf();
        expect(body.from).toEqual({
            email: 'no-reply@petrogassa.com',
            name: 'Petrogassa',
        });
        expect(body.to).toBe('destino@x.com');
        // La API espera snake_case, no camelCase.
        expect(body.reply_to).toBe('juan@x.com');
        expect(body.preview_text).toBe('adelanto');
    });

    it('fromName del correo sobrescribe MAIL_FROM_NAME', async () => {
        fetchSpy.mockResolvedValue(response(true, 200, { id: 'x' }));

        await new EnvialoSimpleProvider(configOf(CONFIGURED)).send(
            mail({ fromName: 'Petrogassa Web' }),
        );

        expect(bodyOf().from).toEqual({
            email: 'no-reply@petrogassa.com',
            name: 'Petrogassa Web',
        });
    });

    it('ante un error de la API devuelve false SIN lanzar', async () => {
        fetchSpy.mockResolvedValue(
            response(false, 403, { error: 'Domain not verified' }),
        );

        await expect(
            new EnvialoSimpleProvider(configOf(CONFIGURED)).send(mail()),
        ).resolves.toBe(false);
    });

    it('sin API key no intenta el envío', async () => {
        const ok = await new EnvialoSimpleProvider(
            configOf({ ...CONFIGURED, ENVIALOSIMPLE_API_KEY: undefined }),
        ).send(mail());

        expect(ok).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('un fallo de red devuelve false sin romper el request', async () => {
        fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(
            new EnvialoSimpleProvider(configOf(CONFIGURED)).send(mail()),
        ).resolves.toBe(false);
    });
});
