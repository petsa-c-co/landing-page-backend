import { ConflictException, NotFoundException } from '@nestjs/common';
import { LinkedInImportService } from './linkedin.service';
import { LinkedInImport } from '../entities/linkedin-import.entity';
import { LinkedInImportStatus } from '../enum/linkedin-import-status.enum';
import { NewsCategory } from '../enum/news-category.enum';
import { ApproveLinkedInImportDto } from '../dto/approve-linkedin-import.dto';
import { LinkedInQueueQueryDto } from '../dto/linkedin-queue-query.dto';

// PNG válido a los ojos de detectFileType: la firma y el mínimo de 12 bytes.
// Va como Uint8Array y no como Buffer porque `.buffer` de un Buffer devuelve el
// pool entero de Node (8 kB, con los datos en un offset): fetch entregaría
// basura, la detección fallaría y el test pasaría por el motivo equivocado.
const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

const PDF = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00, 0x00, 0x00,
]);

const CANDIDATO = (over: Partial<LinkedInImport> = {}): LinkedInImport =>
    ({
        id: 'imp-1',
        externalId: 'urn:li:share:1',
        status: LinkedInImportStatus.PENDING,
        mediaUrl: 'https://media.licdn.com/foto.png',
        text: 'Una novedad',
        authorName: 'Petrogas S.A.',
        externalUrl: 'https://linkedin.com/posts/1',
        postedAt: new Date('2026-09-01T12:00:00Z'),
        ...over,
    }) as LinkedInImport;

const DTO = { category: NewsCategory.NOVEDADES } as ApproveLinkedInImportDto;

/**
 * El primer argumento con el que se llamó a un mock, ya tipado. `mock.calls` es
 * `any[][]`, así que leerlo derecho deja accesos sin tipo por todo el archivo.
 */
const primerArgumento = <T>(simulado: jest.Mock): T => {
    const llamadas = simulado.mock.calls as unknown as T[][];
    return llamadas[0][0];
};

const responderCon = (bytes: Uint8Array): void => {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
};

describe('LinkedInImportService', () => {
    let servicio: LinkedInImportService;
    let importRepository: {
        findOne: jest.Mock;
        findAndCount: jest.Mock;
        create: jest.Mock;
        save: jest.Mock;
    };
    let source: { fetchRecentPosts: jest.Mock };
    let newsService: { createFromLinkedIn: jest.Mock };
    let storageService: { uploadMedia: jest.Mock };
    let mediaReferences: { deleteUnusedKeys: jest.Mock };

    beforeEach(() => {
        importRepository = {
            findOne: jest.fn().mockResolvedValue(CANDIDATO()),
            findAndCount: jest.fn().mockResolvedValue([[], 0]),
            create: jest.fn((x: unknown) => x),
            save: jest.fn((x: unknown) => Promise.resolve(x)),
        };
        source = { fetchRecentPosts: jest.fn().mockResolvedValue([]) };
        newsService = {
            createFromLinkedIn: jest.fn().mockResolvedValue({ id: 'nota-1' }),
        };
        storageService = {
            uploadMedia: jest
                .fn()
                .mockResolvedValue({ key: 'media/descargada.png' }),
        };
        mediaReferences = {
            deleteUnusedKeys: jest.fn().mockResolvedValue(undefined),
        };
        responderCon(PNG);

        servicio = new LinkedInImportService(
            importRepository as never,
            source,
            newsService as never,
            storageService as never,
            mediaReferences as never,
        );
    });

    /** El objeto con el que se pidió crear la nota. */
    const notaCreada = (): Record<string, unknown> =>
        primerArgumento(newsService.createFromLinkedIn);

    describe('sync', () => {
        const posteo = (externalId: string): Record<string, unknown> => ({
            externalId,
            url: `https://linkedin.com/posts/${externalId}`,
            text: 'texto',
            mediaUrl: null,
            authorName: 'Petrogas S.A.',
            postedAt: new Date('2026-09-01T12:00:00Z'),
        });

        it('crea los candidatos que no conocía', async () => {
            source.fetchRecentPosts.mockResolvedValue([
                posteo('a'),
                posteo('b'),
            ]);
            importRepository.findOne.mockResolvedValue(null);

            expect(await servicio.sync()).toEqual({ fetched: 2, created: 2 });
            expect(importRepository.save).toHaveBeenCalledTimes(2);
        });

        /**
         * El dedupe es lo que evita que un posteo ya rechazado vuelva a la cola
         * en cada sync, y que uno aprobado se publique dos veces.
         */
        it('saltea los que ya conocía, sin importar en qué estado', async () => {
            source.fetchRecentPosts.mockResolvedValue([
                posteo('a'),
                posteo('b'),
            ]);
            importRepository.findOne.mockImplementation(
                (opts: { where: { externalId: string } }) =>
                    Promise.resolve(
                        opts.where.externalId === 'a' ? CANDIDATO() : null,
                    ),
            );

            expect(await servicio.sync()).toEqual({ fetched: 2, created: 1 });
            expect(importRepository.save).toHaveBeenCalledTimes(1);
        });
    });

    describe('findQueue', () => {
        const consulta = (
            over: Partial<LinkedInQueueQueryDto> = {},
        ): LinkedInQueueQueryDto => ({ page: 1, limit: 10, ...over });

        it('por defecto muestra los pendientes', async () => {
            await servicio.findQueue(consulta());

            expect(
                primerArgumento<Record<string, unknown>>(
                    importRepository.findAndCount,
                ),
            ).toMatchObject({
                where: { status: LinkedInImportStatus.PENDING },
            });
        });

        it('respeta el estado pedido', async () => {
            await servicio.findQueue(
                consulta({ status: LinkedInImportStatus.REJECTED }),
            );

            expect(
                primerArgumento<Record<string, unknown>>(
                    importRepository.findAndCount,
                ),
            ).toMatchObject({
                where: { status: LinkedInImportStatus.REJECTED },
            });
        });

        // Un posteo sin fecha no debe encabezar la cola: en Postgres un DESC
        // pone los NULL primero.
        it('ordena por fecha con los sin fecha al final', async () => {
            await servicio.findQueue(consulta());

            expect(
                primerArgumento<Record<string, unknown>>(
                    importRepository.findAndCount,
                ),
            ).toMatchObject({
                order: { postedAt: { direction: 'DESC', nulls: 'LAST' } },
            });
        });
    });

    describe('candidatos ya procesados', () => {
        it('aprobar uno inexistente da 404', async () => {
            importRepository.findOne.mockResolvedValue(null);

            await expect(servicio.approve('nope', DTO)).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });

        it('aprobar uno ya procesado da 409', async () => {
            importRepository.findOne.mockResolvedValue(
                CANDIDATO({ status: LinkedInImportStatus.APPROVED }),
            );

            await expect(servicio.approve('imp-1', DTO)).rejects.toBeInstanceOf(
                ConflictException,
            );
        });

        it('rechazar uno ya rechazado da 409', async () => {
            importRepository.findOne.mockResolvedValue(
                CANDIDATO({ status: LinkedInImportStatus.REJECTED }),
            );

            await expect(servicio.reject('imp-1')).rejects.toBeInstanceOf(
                ConflictException,
            );
        });
    });

    describe('reject', () => {
        it('lo marca rechazado y deja constancia de cuándo', async () => {
            const resultado = await servicio.reject('imp-1');

            expect(resultado.status).toBe(LinkedInImportStatus.REJECTED);
            expect(resultado.reviewedAt).toBeInstanceOf(Date);
            expect(newsService.createFromLinkedIn).not.toHaveBeenCalled();
        });
    });

    describe('approve', () => {
        it('publica la nota y ata el candidato a ella', async () => {
            const post = await servicio.approve('imp-1', DTO);

            expect(post.id).toBe('nota-1');
            const guardado = primerArgumento<LinkedInImport>(
                importRepository.save,
            );
            expect(guardado.status).toBe(LinkedInImportStatus.APPROVED);
            expect(guardado.newsPostId).toBe('nota-1');
            expect(guardado.reviewedAt).toBeInstanceOf(Date);
        });

        it('el título tentativo sale de la primera línea del texto', async () => {
            importRepository.findOne.mockResolvedValue(
                CANDIDATO({ text: 'Primera línea\nsegunda línea' }),
            );

            await servicio.approve('imp-1', DTO);

            expect(notaCreada()).toMatchObject({ title: 'Primera línea' });
        });

        // La columna es NOT NULL, así que "sin texto" en la base es la cadena
        // vacía, no null. Es la misma rama de deriveTitle.
        it('sin texto, el título es el autor', async () => {
            importRepository.findOne.mockResolvedValue(CANDIDATO({ text: '' }));

            await servicio.approve('imp-1', DTO);

            expect(notaCreada()).toMatchObject({ title: 'Petrogas S.A.' });
        });

        // La columna title admite 120 caracteres: un posteo largo tiene que
        // entrar recortado, no reventar el insert.
        it('recorta el título largo a 120 caracteres', async () => {
            importRepository.findOne.mockResolvedValue(
                CANDIDATO({ text: 'x'.repeat(400) }),
            );

            await servicio.approve('imp-1', DTO);

            const { title } = notaCreada() as { title: string };
            expect(title).toHaveLength(118);
            expect(title.endsWith('…')).toBe(true);
        });

        it('lo que manda el curador le gana a lo derivado', async () => {
            await servicio.approve('imp-1', {
                ...DTO,
                title: 'Título elegido',
                excerpt: 'Extracto elegido',
            });

            expect(notaCreada()).toMatchObject({
                title: 'Título elegido',
                excerpt: 'Extracto elegido',
            });
        });

        it('baja la imagen y la manda como portada', async () => {
            await servicio.approve('imp-1', DTO);

            expect(notaCreada()).toMatchObject({
                coverImage: 'media/descargada.png',
            });
        });

        /**
         * La descarga es best-effort a propósito: que LinkedIn no entregue la
         * imagen no puede impedir que se publique la novedad.
         */
        it('si la descarga falla, publica igual y sin portada', async () => {
            global.fetch = jest.fn().mockResolvedValue({ ok: false });

            await servicio.approve('imp-1', DTO);

            expect(notaCreada()).toMatchObject({ coverImage: null });
            expect(storageService.uploadMedia).not.toHaveBeenCalled();
        });

        it('un PDF no es una portada válida: se omite', async () => {
            responderCon(PDF);

            await servicio.approve('imp-1', DTO);

            expect(notaCreada()).toMatchObject({ coverImage: null });
            expect(storageService.uploadMedia).not.toHaveBeenCalled();
        });
    });

    /**
     * La imagen se descarga ANTES de crear la nota, así que entre las dos hay
     * una ventana en la que el archivo ya está en el disco y todavía no lo
     * referencia nadie. Es una fuga que no rompe nada, y por eso nadie la vería.
     */
    describe('la imagen huérfana de una aprobación fallida', () => {
        it('si la nota no se puede crear, borra la imagen ya descargada', async () => {
            newsService.createFromLinkedIn.mockRejectedValue(
                new Error('slug repetido'),
            );

            await expect(servicio.approve('imp-1', DTO)).rejects.toThrow(
                'slug repetido',
            );

            expect(mediaReferences.deleteUnusedKeys).toHaveBeenCalledWith([
                'media/descargada.png',
            ]);
        });

        // Lo que el curador necesita ver es por qué no se creó la nota, no un
        // error de borrado.
        it('y aun así propaga el error original', async () => {
            newsService.createFromLinkedIn.mockRejectedValue(
                new Error('la base'),
            );
            mediaReferences.deleteUnusedKeys.mockRejectedValue(
                new Error('el disco'),
            );

            await expect(servicio.approve('imp-1', DTO)).rejects.toThrow(
                'la base',
            );
        });

        it('si la aprobación sale bien no borra nada', async () => {
            await servicio.approve('imp-1', DTO);

            expect(mediaReferences.deleteUnusedKeys).not.toHaveBeenCalled();
        });

        it('sin imagen no hay nada que limpiar', async () => {
            importRepository.findOne.mockResolvedValue(
                CANDIDATO({ mediaUrl: null }),
            );
            newsService.createFromLinkedIn.mockRejectedValue(
                new Error('falló'),
            );

            await expect(servicio.approve('imp-1', DTO)).rejects.toThrow(
                'falló',
            );

            expect(mediaReferences.deleteUnusedKeys).not.toHaveBeenCalled();
        });
    });
});
