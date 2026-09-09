import { BadRequestException, HttpException } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { GestionClient } from '../gestion/gestion.client';

/**
 * El formulario público de postulación es el único endpoint sin autenticación
 * que reenvía contenido de un desconocido a un sistema ajeno, firmado con
 * nuestro GESTION_API_TOKEN.
 *
 * De todo lo que hay acá, el test que importa es que un archivo rechazado
 * NUNCA llegue a `submitApplication`: el código de estado es cosmética, lo que
 * se está afirmando es que el token no salió.
 */
describe('ApplicationsController', () => {
    let controller: ApplicationsController;
    let gestion: { submitApplication: jest.Mock };

    // 12 bytes es el mínimo que mira detectFileType.
    const archivo = (
        contenido: string | Buffer,
        over: Partial<Express.Multer.File> = {},
    ): Express.Multer.File =>
        ({
            buffer: Buffer.isBuffer(contenido)
                ? contenido
                : Buffer.from(contenido, 'latin1'),
            originalname: 'cv.pdf',
            mimetype: 'application/pdf',
            ...over,
        }) as Express.Multer.File;

    const PDF = archivo('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');

    const formulario = {
        fullName: 'Nicolás Pérez',
        email: 'nico@example.com',
        phone: '299 555 0000',
        location: 'Neuquén',
        jobProfileIds: ['1', '7'],
    };

    // `async` a propósito: create() valida y lanza de forma SINCRÓNICA, así que
    // sin esto los rechazos no llegan como promesa rechazada.
    const enviar = async (
        cv: Express.Multer.File | undefined = PDF,
        campos: Partial<typeof formulario> = {},
    ): Promise<unknown> => controller.create({ ...formulario, ...campos }, cv);

    let avisos: jest.SpyInstance;

    beforeEach(() => {
        gestion = {
            submitApplication: jest
                .fn()
                .mockResolvedValue({ id: 1, status: 'received' }),
        };
        controller = new ApplicationsController(
            gestion as unknown as GestionClient,
        );
        const conLogger = controller as unknown as {
            logger: { warn: (mensaje: string) => void };
        };
        avisos = jest
            .spyOn(conLogger.logger, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('el CV tiene que ser un PDF de verdad', () => {
        it('acepta un PDF y le pasa el tipo VERIFICADO al cliente', async () => {
            await enviar(PDF);

            expect(gestion.submitApplication).toHaveBeenCalledWith(
                expect.objectContaining({ cvContentType: 'application/pdf' }),
            );
        });

        /**
         * EL test. Un ejecutable renombrado, declarándose PDF: lo que importa
         * no es el 422, es que `submitApplication` no se haya llamado.
         */
        it('un ejecutable renombrado NO sale hacia Gestión', async () => {
            const exe = archivo(
                Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]),
            );

            await expect(enviar(exe)).rejects.toThrow(HttpException);
            expect(gestion.submitApplication).not.toHaveBeenCalled();
        });

        it('no le cree al mimetype que declara el cliente', async () => {
            const png = archivo(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13]),
                { mimetype: 'application/pdf', originalname: 'cv.pdf' },
            );

            await expect(enviar(png)).rejects.toThrow(HttpException);
            expect(gestion.submitApplication).not.toHaveBeenCalled();
        });

        // detectFileType devuelve null por debajo de 12 bytes: sin este caso, un
        // archivo minúsculo se colaría por el borde.
        it('rechaza un archivo más corto que la firma', async () => {
            await expect(enviar(archivo('%PDF'))).rejects.toThrow(HttpException);
            expect(gestion.submitApplication).not.toHaveBeenCalled();
        });

        it('rechaza con 422 y el detalle en el campo cv', async () => {
            const exe = archivo(Buffer.from([0x4d, 0x5a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

            await expect(enviar(exe)).rejects.toMatchObject({
                status: 422,
                response: {
                    message: 'El CV debe ser un PDF.',
                    errors: { cv: ['El CV debe ser un PDF.'] },
                },
            });
        });

        // Es un request incompleto, no un contenido inválido. Está documentado
        // como 400 y así se queda.
        it('sin archivo sigue siendo 400, no 422', async () => {
            // Directo al controller: `enviar(undefined)` tomaría el PDF por
            // defecto del helper y no probaría nada.
            const sinArchivo = async (): Promise<unknown> =>
                controller.create(formulario, undefined);

            await expect(sinArchivo()).rejects.toThrow(BadRequestException);
            expect(gestion.submitApplication).not.toHaveBeenCalled();
        });
    });

    describe('contenido activo del PDF', () => {
        it('rechaza un PDF con JavaScript embebido', async () => {
            const conJs = archivo(
                '%PDF-1.7\n<< /S /JavaScript /JS (app.alert(1)) >>\n%%EOF',
            );

            await expect(enviar(conJs)).rejects.toMatchObject({
                status: 422,
                response: {
                    errors: {
                        cv: [expect.stringContaining('contenido activo')],
                    },
                },
            });
            expect(gestion.submitApplication).not.toHaveBeenCalled();
        });

        /**
         * /OpenAction sin JavaScript es común y benigno (fija el zoom o la
         * página inicial). Rechazarlo tiraría abajo CV legítimos.
         */
        it('acepta un PDF con /OpenAction pero sin JavaScript', async () => {
            const conOpenAction = archivo(
                '%PDF-1.7\n<< /OpenAction [ 3 0 R /XYZ null null 0 ] >>\n%%EOF',
            );

            await enviar(conOpenAction);

            expect(gestion.submitApplication).toHaveBeenCalled();
        });
    });

    describe('máximo de puestos', () => {
        it('acepta hasta tres', async () => {
            await enviar(PDF, { jobProfileIds: ['1', '2', '3'] });

            expect(gestion.submitApplication).toHaveBeenCalledWith(
                expect.objectContaining({ jobProfileIds: ['1', '2', '3'] }),
            );
        });

        it('rechaza el cuarto con 422 y el detalle en jobProfileIds', async () => {
            await expect(
                enviar(PDF, { jobProfileIds: ['1', '2', '3', '4'] }),
            ).rejects.toMatchObject({
                status: 422,
                response: {
                    errors: { jobProfileIds: ['Podés elegir hasta 3 puestos.'] },
                },
            });
            expect(gestion.submitApplication).not.toHaveBeenCalled();
        });

        // Un solo puesto llega como texto suelto, no como arreglo.
        it('normaliza un puesto único a arreglo', async () => {
            await enviar(PDF, {
                jobProfileIds: '7' as unknown as string[],
            });

            expect(gestion.submitApplication).toHaveBeenCalledWith(
                expect.objectContaining({ jobProfileIds: ['7'] }),
            );
        });

        it('sin puestos no rompe', async () => {
            await enviar(PDF, { jobProfileIds: undefined });

            expect(gestion.submitApplication).toHaveBeenCalledWith(
                expect.objectContaining({ jobProfileIds: [] }),
            );
        });
    });

    /**
     * Si algún día rebotan CV legítimos, el log es lo único que va a decir por
     * qué. Pero es el CV de una persona: no puede quedar el contenido.
     */
    it('registra el rechazo sin volcar el contenido del archivo', async () => {
        const secreto = 'DATOS-PERSONALES-DEL-POSTULANTE';

        await expect(
            enviar(archivo(`MZ\0\0\0\0\0\0\0\0\0\0${secreto}`)),
        ).rejects.toThrow(HttpException);

        const registrado = avisos.mock.calls.flat().join(' ');
        expect(registrado).not.toContain(secreto);
        expect(registrado).toContain('cv.pdf');
    });
});
