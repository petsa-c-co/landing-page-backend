import {
    BadGatewayException,
    HttpException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GestionClient } from './gestion.client';

/**
 * El puente hacia Gestión Petrogas es la única parte del backend que depende de
 * un sistema ajeno en el camino de un visitante. No podemos probar la API de
 * ellos, pero sí podemos fijar cómo reaccionamos a cada respuesta posible: es
 * justo donde un cambio del otro lado degrada en silencio.
 *
 * La forma del GET está verificada contra la API real (25/08/2026: arreglo
 * pelado de `{ id, name }`). El resto son los contratos que sostenemos.
 */
describe('GestionClient', () => {
    let client: GestionClient;
    let fetchMock: jest.Mock;

    const respuesta = (
        cuerpo: unknown,
        { ok = true, status = 200 } = {},
    ): Response =>
        ({
            ok,
            status,
            json: () => Promise.resolve(cuerpo),
            text: () => Promise.resolve(JSON.stringify(cuerpo)),
        }) as unknown as Response;

    const cv = {
        buffer: Buffer.from('%PDF-1.4 falso'),
        originalname: 'Currículum Nicolás.pdf',
        mimetype: 'application/pdf',
    } as Express.Multer.File;

    const postulacion = {
        fullName: 'Nicolás Pérez',
        email: 'nico@example.com',
        phone: '299 555 0000',
        location: 'Neuquén',
        jobProfileIds: ['1', '7'],
        cv,
        // Lo pone el controller después de mirar los bytes; acá se simula.
        cvContentType: 'application/pdf' as const,
    };

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock;
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        client = new GestionClient({
            get: (clave: string) =>
                clave === 'GESTION_API_BASE_URL'
                    ? 'https://gestion.example.com/api/v1'
                    : 'token-secreto',
        } as unknown as ConfigService);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('fetchJobPositions', () => {
        it('acepta el arreglo pelado, que es lo que devuelve hoy', async () => {
            fetchMock.mockResolvedValue(
                respuesta([{ id: 1, name: 'Administrativo' }]),
            );

            await expect(client.fetchJobPositions()).resolves.toEqual([
                { id: 1, name: 'Administrativo' },
            ]);
        });

        // El POST de postulaciones SÍ viene envuelto en `data`, así que nada
        // garantiza que no unifiquen el GET algún día.
        it('acepta también el arreglo envuelto en data', async () => {
            fetchMock.mockResolvedValue(
                respuesta({ data: [{ id: 2, name: 'Pañolero' }] }),
            );

            await expect(client.fetchJobPositions()).resolves.toEqual([
                { id: 2, name: 'Pañolero' },
            ]);
        });

        /**
         * El caso que motiva el guard: con un cast a ciegas, un objeto donde va
         * un arreglo llegaba al frontend como 200, el select de puestos quedaba
         * vacío y no había una sola línea en el log. Un 502 se diagnostica.
         */
        it('corta con 502 si el cuerpo no es una lista, en vez de devolver 200', async () => {
            fetchMock.mockResolvedValue(respuesta({ puestos: [] }));

            await expect(client.fetchJobPositions()).rejects.toThrow(
                BadGatewayException,
            );
        });

        it('corta con 502 si el cuerpo no es ni JSON', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.reject(new Error('Unexpected token <')),
            });

            await expect(client.fetchJobPositions()).rejects.toThrow(
                BadGatewayException,
            );
        });

        it('traduce un 500 de Gestión a un mensaje para el visitante', async () => {
            fetchMock.mockResolvedValue(
                respuesta({ message: 'Server Error' }, { ok: false, status: 500 }),
            );

            await expect(client.fetchJobPositions()).rejects.toThrow(
                BadGatewayException,
            );
        });

        it('no deja colgado al visitante: el fetch va con timeout', async () => {
            fetchMock.mockResolvedValue(respuesta([]));

            await client.fetchJobPositions();

            const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(init.signal).toBeInstanceOf(AbortSignal);
        });

        it('traduce un timeout a 503, no a un error interno', async () => {
            fetchMock.mockRejectedValue(
                Object.assign(new Error('The operation was aborted'), {
                    name: 'TimeoutError',
                }),
            );

            await expect(client.fetchJobPositions()).rejects.toThrow(
                ServiceUnavailableException,
            );
        });
    });

    describe('submitApplication', () => {
        it('devuelve el recibo que viene envuelto en data', async () => {
            fetchMock.mockResolvedValue(
                respuesta({ data: { id: 42, status: 'received' } }),
            );

            await expect(client.submitApplication(postulacion)).resolves.toEqual({
                id: 42,
                status: 'received',
            });
        });

        it('acepta el recibo sin sobre', async () => {
            fetchMock.mockResolvedValue(respuesta({ id: 43, status: 'ok' }));

            await expect(client.submitApplication(postulacion)).resolves.toEqual({
                id: 43,
                status: 'ok',
            });
        });

        it('si no reconoce un recibo lo deja registrado, sin inventar el id', async () => {
            const warn = jest
                .spyOn(
                    (client as unknown as { logger: { warn: () => void } })
                        .logger,
                    'warn',
                )
                .mockImplementation(() => undefined);
            fetchMock.mockResolvedValue(respuesta({ ok: true }));

            await expect(client.submitApplication(postulacion)).resolves.toEqual({
                id: 0,
                status: 'received',
            });
            expect(warn).toHaveBeenCalled();
        });

        /**
         * Las reglas del formulario son de Gestión a propósito (duplicarlas acá
         * garantiza que queden desfasadas). Su 422 tiene que llegar al frontend
         * con el detalle por campo, o el formulario no puede marcar nada.
         */
        it('reenvía el 422 de Gestión con el detalle por campo', async () => {
            fetchMock.mockResolvedValue(
                respuesta(
                    {
                        message: 'Los datos son inválidos.',
                        errors: { email: ['El correo ya fue registrado.'] },
                    },
                    { ok: false, status: 422 },
                ),
            );

            await expect(
                client.submitApplication(postulacion),
            ).rejects.toMatchObject({
                status: 422,
                response: {
                    message: 'Los datos son inválidos.',
                    errors: { email: ['El correo ya fue registrado.'] },
                },
            });
        });

        it('un 422 sin cuerpo utilizable igual llega como 422', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 422,
                text: () => Promise.resolve('<html>502</html>'),
            });

            await expect(client.submitApplication(postulacion)).rejects.toThrow(
                HttpException,
            );
        });

        it('manda los puestos con la notación que espera Gestión', async () => {
            fetchMock.mockResolvedValue(respuesta({ data: { id: 1, status: 'x' } }));

            await client.submitApplication(postulacion);

            const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            const form = init.body as FormData;
            expect(form.getAll('jobProfileIds[]')).toEqual(['1', '7']);
        });

        /**
         * Antes iba `type: 'application/pdf'` fijo, así que cualquier binario
         * salía hacia Gestión etiquetado como PDF. Ahora sale de lo que el
         * controller verificó mirando los bytes.
         */
        it('etiqueta el adjunto con el tipo VERIFICADO, no con una constante', async () => {
            fetchMock.mockResolvedValue(respuesta({ data: { id: 1, status: 'x' } }));

            await client.submitApplication(postulacion);

            const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            const archivo = (init.body as FormData).get('cv') as File;
            expect(archivo.type).toBe(postulacion.cvContentType);
        });

        // Se sacó un `new Uint8Array(buffer)` que copiaba hasta 5 MB al pedo.
        // Esto fija que el archivo llegue completo e intacto.
        it('manda el archivo entero, sin truncarlo ni recodificarlo', async () => {
            fetchMock.mockResolvedValue(respuesta({ data: { id: 1, status: 'x' } }));

            await client.submitApplication(postulacion);

            const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            const archivo = (init.body as FormData).get('cv') as File;
            expect(archivo.size).toBe(cv.buffer.length);
        });

        it('conserva los acentos del nombre del CV', async () => {
            fetchMock.mockResolvedValue(respuesta({ data: { id: 1, status: 'x' } }));

            await client.submitApplication(postulacion);

            const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            const archivo = (init.body as FormData).get('cv') as File;
            expect(archivo.name).toBe('Currículum Nicolás.pdf');
        });

        it('el CV nunca toca nuestro disco: viaja en el cuerpo del request', async () => {
            fetchMock.mockResolvedValue(respuesta({ data: { id: 1, status: 'x' } }));

            await client.submitApplication(postulacion);

            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://gestion.example.com/api/v1/site/job-applications');
            expect(init.body).toBeInstanceOf(FormData);
        });
    });
});
