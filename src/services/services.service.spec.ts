import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ServicesService } from './services.service';
import { Service } from './entities/service.entity';
import { StorageService } from '@/storage/storage.service';
import { MediaReferencesService } from '@/media/media-references.service';

const makeService = (over: Partial<Service> = {}): Service =>
    ({
        id: 's1',
        title: 'Well Testing',
        slug: 'well-testing',
        cardImage: 'media/a.png',
        bannerImage: 'media/b.png',
        detailImage: null,
        isActive: true,
        sortOrder: 0,
        deletedAt: null,
        items: [],
        ...over,
    }) as Service;

describe('ServicesService', () => {
    let service: ServicesService;
    let repo: {
        findOne: jest.Mock;
        remove: jest.Mock;
        merge: jest.Mock;
        save: jest.Mock;
        manager: { create: jest.Mock };
    };
    let mediaRefs: { deleteUnusedKeys: jest.Mock };

    beforeEach(() => {
        repo = {
            findOne: jest.fn(),
            remove: jest.fn((x: Service) => Promise.resolve(x)),
            merge: jest.fn((base: Service, patch: Partial<Service>) =>
                Object.assign(base, patch),
            ),
            save: jest.fn((x: Service) => Promise.resolve(x)),
            manager: { create: jest.fn() },
        };
        mediaRefs = { deleteUnusedKeys: jest.fn().mockResolvedValue(undefined) };
        service = new ServicesService(
            repo as unknown as Repository<Service>,
            { publicUrl: (k: string) => `https://cdn/${k}` } as StorageService,
            mediaRefs as unknown as MediaReferencesService,
        );
    });

    describe('removePermanent', () => {
        it('elimina uno que está en la papelera, con sus imágenes', async () => {
            repo.findOne.mockResolvedValue(
                makeService({ deletedAt: new Date() }),
            );

            await service.removePermanent('s1');

            expect(repo.remove).toHaveBeenCalled();
            expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith([
                'media/a.png',
                'media/b.png',
            ]);
        });

        /**
         * Sin esta guarda, un id de un servicio publicado lo destruía junto con
         * sus imágenes, sin vuelta atrás. Simétrico con restore().
         */
        it('RECHAZA uno que no está en la papelera', async () => {
            repo.findOne.mockResolvedValue(makeService({ deletedAt: null }));

            await expect(service.removePermanent('s1')).rejects.toThrow(
                ConflictException,
            );
            expect(repo.remove).not.toHaveBeenCalled();
            expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalled();
        });

        it('404 si no existe', async () => {
            repo.findOne.mockResolvedValue(null);

            await expect(service.removePermanent('s1')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('update (limpieza de imágenes)', () => {
        /**
         * El caso que motivó orphanKeys: campo por campo esto parecían dos
         * reemplazos y se borraban las dos imágenes, cuando las dos siguen en uso.
         */
        it('intercambiar dos imágenes NO borra ninguna', async () => {
            repo.findOne.mockResolvedValue(makeService());

            await service.update('s1', {
                cardImage: 'media/b.png',
                bannerImage: 'media/a.png',
            });

            expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith([]);
        });

        it('reemplazar una imagen marca solo la que salió', async () => {
            repo.findOne.mockResolvedValue(makeService());

            await service.update('s1', { cardImage: 'media/nueva.png' });

            expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith([
                'media/a.png',
            ]);
        });

        it('si el save falla, no se borra ninguna imagen', async () => {
            repo.findOne.mockResolvedValue(makeService());
            repo.save.mockRejectedValue(new Error('db caída'));

            await expect(
                service.update('s1', { cardImage: 'media/nueva.png' }),
            ).rejects.toThrow('db caída');
            expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalled();
        });
    });
});
