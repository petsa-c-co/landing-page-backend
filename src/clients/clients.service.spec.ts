import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientsService } from './clients.service';
import { Client } from './entities/client.entity';
import { StorageService } from '@/storage/storage.service';
import { MediaReferencesService } from '@/media/media-references.service';

const makeClient = (over: Partial<Client> = {}): Client =>
    ({
        id: 'c1',
        name: 'ACME',
        logoImage: 'media/logo.png',
        sortOrder: 0,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...over,
    });

describe('ClientsService (papelera / soft delete)', () => {
    let service: ClientsService;
    let repo: {
        find: jest.Mock;
        findOne: jest.Mock;
        softRemove: jest.Mock;
        recover: jest.Mock;
        remove: jest.Mock;
        merge: jest.Mock;
        save: jest.Mock;
    };
    let storage: { publicUrl: jest.Mock; deleteMedia: jest.Mock };
    let mediaRefs: { deleteUnusedKeys: jest.Mock };

    beforeEach(() => {
        repo = {
            find: jest.fn(),
            findOne: jest.fn(),
            softRemove: jest.fn((x: Client) => Promise.resolve(x)),
            recover: jest.fn((x: Client) => Promise.resolve(x)),
            remove: jest.fn((x: Client) => Promise.resolve(x)),
            merge: jest.fn((base: Client, patch: Partial<Client>) =>
                Object.assign(base, patch),
            ),
            save: jest.fn((x: Client) => Promise.resolve(x)),
        };
        storage = {
            publicUrl: jest.fn((k: string) => `https://cdn/${k}`),
            deleteMedia: jest.fn().mockResolvedValue(undefined),
        };
        // La limpieza de archivos pasa por MediaReferencesService, que además
        // verifica que ninguna otra entidad siga usando la key.
        mediaRefs = { deleteUnusedKeys: jest.fn().mockResolvedValue(undefined) };
        service = new ClientsService(
            repo as unknown as Repository<Client>,
            storage as unknown as StorageService,
            mediaRefs as unknown as MediaReferencesService,
        );
    });

    it('remove hace soft delete (softRemove): no borra la fila ni el archivo', async () => {
        repo.findOne.mockResolvedValue(makeClient());
        await service.remove('c1');
        expect(repo.softRemove).toHaveBeenCalled();
        expect(repo.remove).not.toHaveBeenCalled();
        expect(storage.deleteMedia).not.toHaveBeenCalled();
    });

    it('findTrash lista solo borrados (withDeleted) con URL absoluta', async () => {
        repo.find.mockResolvedValue([makeClient({ deletedAt: new Date() })]);
        const trash = await service.findTrash();
        expect(repo.find).toHaveBeenCalledWith(
            expect.objectContaining({ withDeleted: true }),
        );
        expect(trash[0].logoImage).toBe('https://cdn/media/logo.png');
    });

    it('restore recupera un cliente que está en la papelera', async () => {
        repo.findOne.mockResolvedValue(makeClient({ deletedAt: new Date() }));
        const restored = await service.restore('c1');
        expect(repo.recover).toHaveBeenCalled();
        expect(restored.logoImage).toBe('https://cdn/media/logo.png');
    });

    it('restore falla (409) si el cliente no está en la papelera', async () => {
        repo.findOne.mockResolvedValue(makeClient({ deletedAt: null }));
        await expect(service.restore('c1')).rejects.toThrow(ConflictException);
        expect(repo.recover).not.toHaveBeenCalled();
    });

    it('restore 404 si no existe', async () => {
        repo.findOne.mockResolvedValue(null);
        await expect(service.restore('c1')).rejects.toThrow(NotFoundException);
    });

    it('removePermanent hace hard delete y recién ahí limpia el archivo', async () => {
        repo.findOne.mockResolvedValue(makeClient({ deletedAt: new Date() }));
        await service.removePermanent('c1');
        expect(repo.remove).toHaveBeenCalled();
        expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith([
            'media/logo.png',
        ]);
    });

    /**
     * El borrado definitivo es la SALIDA de la papelera: sobre un registro vivo
     * destruía la fila y su archivo sin vuelta atrás. Simétrico con restore().
     */
    it('removePermanent RECHAZA un cliente que no está en la papelera', async () => {
        repo.findOne.mockResolvedValue(makeClient({ deletedAt: null }));

        await expect(service.removePermanent('c1')).rejects.toThrow(
            ConflictException,
        );
        expect(repo.remove).not.toHaveBeenCalled();
        expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalled();
    });

    describe('update (el logo viejo se borra DESPUÉS del save)', () => {
        it('si el save falla, NO borra el logo anterior', async () => {
            repo.findOne.mockResolvedValue(makeClient());
            repo.save.mockRejectedValue(new Error('db caída'));

            await expect(
                service.update('c1', { logoImage: 'media/nuevo.png' }),
            ).rejects.toThrow('db caída');
            expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalled();
        });

        it('con save exitoso, borra el logo anterior reemplazado', async () => {
            repo.findOne.mockResolvedValue(makeClient());

            await service.update('c1', { logoImage: 'media/nuevo.png' });
            expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith([
                'media/logo.png',
            ]);
        });
    });
});
