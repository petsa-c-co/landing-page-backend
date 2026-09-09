import { Repository } from 'typeorm';
import { SiteImagesService } from './site-images.service';
import { SiteImage } from './entities/site-image.entity';
import { StorageService } from '@/storage/storage.service';
import { MediaReferencesService } from '@/media/media-references.service';

const makeImage = (over: Partial<SiteImage> = {}): SiteImage =>
    ({
        id: 'img-1',
        slot: 'banner-nosotros',
        imageKey: 'media/2026/07/vieja.webp',
        ...over,
    }) as SiteImage;

describe('SiteImagesService (imágenes de cabecera por slot)', () => {
    let service: SiteImagesService;
    let repo: {
        find: jest.Mock;
        findOne: jest.Mock;
        create: jest.Mock;
        save: jest.Mock;
        remove: jest.Mock;
    };
    let storage: { publicUrl: jest.Mock; deleteMedia: jest.Mock };
    let mediaRefs: { deleteUnusedKeys: jest.Mock };

    beforeEach(() => {
        repo = {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((x: Partial<SiteImage>) => x as SiteImage),
            save: jest.fn((x: SiteImage) => Promise.resolve(x)),
            remove: jest.fn((x: SiteImage) => Promise.resolve(x)),
        };
        storage = {
            publicUrl: jest.fn((k: string) => `https://cdn/${k}`),
            deleteMedia: jest.fn().mockResolvedValue(undefined),
        };
        mediaRefs = { deleteUnusedKeys: jest.fn().mockResolvedValue(undefined) };
        service = new SiteImagesService(
            repo as unknown as Repository<SiteImage>,
            storage as unknown as StorageService,
            mediaRefs as unknown as MediaReferencesService,
        );
    });

    describe('findAll', () => {
        it('sin nada cargado devuelve un mapa vacío (nunca 404)', async () => {
            await expect(service.findAll()).resolves.toEqual({});
        });

        it('devuelve slot -> URL absoluta', async () => {
            repo.find.mockResolvedValue([
                makeImage(),
                makeImage({ slot: 'home-hero', imageKey: 'media/hero.webp' }),
            ]);

            await expect(service.findAll()).resolves.toEqual({
                'banner-nosotros': 'https://cdn/media/2026/07/vieja.webp',
                'home-hero': 'https://cdn/media/hero.webp',
            });
        });
    });

    describe('update', () => {
        it('crea el slot la primera vez, sin tocar el storage', async () => {
            await service.update({
                slot: 'banner-contacto',
                imageKey: 'media/nueva.webp',
            });

            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    slot: 'banner-contacto',
                    imageKey: 'media/nueva.webp',
                }),
            );
            expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(String)]),
            );
        });

        it('reemplaza la imagen y borra la anterior', async () => {
            repo.findOne.mockResolvedValue(makeImage());

            await service.update({
                slot: 'banner-nosotros',
                imageKey: 'media/nueva.webp',
            });

            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({ imageKey: 'media/nueva.webp' }),
            );
            expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith(['media/2026/07/vieja.webp']);
        });

        it('imageKey en null limpia el slot y borra la imagen', async () => {
            repo.findOne.mockResolvedValue(makeImage());

            await service.update({
                slot: 'banner-nosotros',
                imageKey: null,
            });

            expect(repo.remove).toHaveBeenCalled();
            expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith(['media/2026/07/vieja.webp']);
        });

        it('reasignar la MISMA key no borra nada del storage', async () => {
            repo.findOne.mockResolvedValue(makeImage());

            await service.update({
                slot: 'banner-nosotros',
                imageKey: 'media/2026/07/vieja.webp',
            });

            expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(String)]),
            );
        });

        it('si el guardado falla, NO borra la imagen anterior', async () => {
            repo.findOne.mockResolvedValue(makeImage());
            repo.save.mockRejectedValue(new Error('db caída'));

            await expect(
                service.update({
                    slot: 'banner-nosotros',
                    imageKey: 'media/nueva.webp',
                }),
            ).rejects.toThrow('db caída');
            expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(String)]),
            );
        });
    });
});
