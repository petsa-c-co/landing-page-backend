import { Repository } from 'typeorm';
import { SiteSettingsService } from './site-settings.service';
import { SiteSettings } from './entities/site-settings.entity';
import { StorageService } from '@/storage/storage.service';
import { MediaReferencesService } from '@/media/media-references.service';
import { SiteRevisionService } from '@/change-log/site-revision.service';

const makeRow = (over: Partial<SiteSettings> = {}): SiteSettings =>
    ({
        id: 's1',
        certificationMarkImage: 'media/2026/07/marca.png',
        certificationScopeText: 'Alcance: operación y mantenimiento.',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...over,
    });

describe('SiteSettingsService (singleton del sitio)', () => {
    let service: SiteSettingsService;
    let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
    let storage: { publicUrl: jest.Mock; deleteMedia: jest.Mock };
    let mediaRefs: { deleteUnusedKeys: jest.Mock };
    let revisiones: { actual: jest.Mock };

    beforeEach(() => {
        repo = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((x: Partial<SiteSettings>) => x as SiteSettings),
            save: jest.fn((x: SiteSettings) => Promise.resolve(x)),
        };
        storage = {
            publicUrl: jest.fn((k: string) => `https://cdn/${k}`),
            deleteMedia: jest.fn().mockResolvedValue(undefined),
        };
        mediaRefs = { deleteUnusedKeys: jest.fn().mockResolvedValue(undefined) };
        // El footer recibe la revisión junto con la marca de certificación: es
        // el endpoint que ya consume en todas las páginas.
        revisiones = {
            actual: jest
                .fn()
                .mockResolvedValue({ revision: '0.0', revisionDate: null }),
        };
        service = new SiteSettingsService(
            repo as unknown as Repository<SiteSettings>,
            storage as unknown as StorageService,
            mediaRefs as unknown as MediaReferencesService,
            revisiones as unknown as SiteRevisionService,
        );
    });

    it('get sin fila devuelve los campos en null (nunca 404)', async () => {
        await expect(service.get()).resolves.toEqual({
            certificationMarkImage: null,
            certificationScopeText: null,
            revision: '0.0',
            revisionDate: null,
        });
    });

    it('get con fila resuelve la imagen a URL absoluta', async () => {
        repo.findOne.mockResolvedValue(makeRow());
        const view = await service.get();
        expect(view.certificationMarkImage).toBe(
            'https://cdn/media/2026/07/marca.png',
        );
        expect(view.certificationScopeText).toContain('Alcance');
    });

    it('el primer PATCH crea la fila (upsert del singleton)', async () => {
        await service.update({
            certificationMarkImage: 'media/2026/07/nueva.png',
        });
        expect(repo.create).toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                certificationMarkImage: 'media/2026/07/nueva.png',
            }),
        );
        expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(String)]),
            );
    });

    it('campo ausente en el PATCH no se toca', async () => {
        repo.findOne.mockResolvedValue(makeRow());
        await service.update({ certificationScopeText: 'Nuevo alcance' });
        // Sobre la ENTIDAD, no sobre la vista: la revisión no se persiste, se
        // calcula del registro de cambios al leer.
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                certificationMarkImage: 'media/2026/07/marca.png',
                certificationScopeText: 'Nuevo alcance',
            }),
        );
        expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(String)]),
            );
    });

    it('reemplazar la imagen borra la anterior DESPUÉS del save', async () => {
        repo.findOne.mockResolvedValue(makeRow());
        await service.update({
            certificationMarkImage: 'media/2026/07/nueva.png',
        });
        expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith(['media/2026/07/marca.png']);
    });

    it('si el save falla, NO borra la imagen anterior', async () => {
        repo.findOne.mockResolvedValue(makeRow());
        repo.save.mockRejectedValue(new Error('db caída'));
        await expect(
            service.update({
                certificationMarkImage: 'media/2026/07/nueva.png',
            }),
        ).rejects.toThrow('db caída');
        expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(String)]),
            );
    });

    it('null explícito limpia el campo y borra la imagen', async () => {
        repo.findOne.mockResolvedValue(makeRow());
        const view = await service.update({ certificationMarkImage: null });
        expect(view.certificationMarkImage).toBeNull();
        expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith(['media/2026/07/marca.png']);
    });
});
