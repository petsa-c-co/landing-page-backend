import { DataSource } from 'typeorm';
import { MediaReferencesService } from './media-references.service';
import { StorageService } from '@/storage/storage.service';

describe('MediaReferencesService', () => {
    let service: MediaReferencesService;
    let exists: jest.Mock;
    let deleteMedia: jest.Mock;

    beforeEach(() => {
        exists = jest.fn().mockResolvedValue(false);
        deleteMedia = jest.fn().mockResolvedValue(undefined);
        service = new MediaReferencesService(
            { manager: { exists } } as unknown as DataSource,
            { deleteMedia } as unknown as StorageService,
        );
    });

    describe('findReference', () => {
        it('recorre las 6 entidades con archivos y devuelve null si está libre', async () => {
            await expect(service.findReference('media/x.png')).resolves.toBeNull();
            // servicios, certificaciones, clientes, novedades, configuración del
            // sitio e imágenes de cabecera por slot.
            expect(exists).toHaveBeenCalledTimes(6);
        });

        it('mira TAMBIÉN la papelera: un item borrado conserva su archivo', async () => {
            await service.findReference('media/x.png');

            expect(exists).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ withDeleted: true }),
            );
        });

        it('devuelve la etiqueta de quien la usa y corta la búsqueda ahí', async () => {
            exists.mockResolvedValueOnce(true);

            await expect(service.findReference('media/x.png')).resolves.toBe(
                'un servicio',
            );
            expect(exists).toHaveBeenCalledTimes(1);
        });
    });

    describe('deleteUnusedKeys', () => {
        it('borra las que nadie usa', async () => {
            await service.deleteUnusedKeys(['media/a.png', 'media/b.png']);

            expect(deleteMedia).toHaveBeenCalledWith('media/a.png');
            expect(deleteMedia).toHaveBeenCalledWith('media/b.png');
        });

        /**
         * El caso que motivó extraer este servicio: antes los módulos del CMS
         * borraban sin preguntar y podían dejar sin imagen a otra entidad.
         */
        it('NO borra una key que sigue referenciada por otra entidad', async () => {
            exists.mockResolvedValueOnce(true);

            await service.deleteUnusedKeys(['media/compartida.png']);

            expect(deleteMedia).not.toHaveBeenCalled();
        });

        it('un fallo al borrar no interrumpe las demás ni propaga', async () => {
            deleteMedia
                .mockRejectedValueOnce(new Error('disco lleno'))
                .mockResolvedValueOnce(undefined);

            await expect(
                service.deleteUnusedKeys(['media/a.png', 'media/b.png']),
            ).resolves.toBeUndefined();
            expect(deleteMedia).toHaveBeenCalledTimes(2);
        });

        it('sin keys no consulta nada', async () => {
            await service.deleteUnusedKeys([]);
            expect(exists).not.toHaveBeenCalled();
            expect(deleteMedia).not.toHaveBeenCalled();
        });
    });
});
