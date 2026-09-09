import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CertificationsService } from './certifications.service';
import { Certification } from './entities/certification.entity';
import { StorageService } from '@/storage/storage.service';
import { MediaReferencesService } from '@/media/media-references.service';

const makeCertification = (over: Partial<Certification> = {}): Certification =>
    ({
        id: 'c1',
        name: 'ISO 9001',
        logoImage: 'media/logo.png',
        certificatePdf: 'media/cert.pdf',
        sortOrder: 0,
        deletedAt: null,
        ...over,
    }) as Certification;

describe('CertificationsService', () => {
    let service: CertificationsService;
    let repo: { findOne: jest.Mock; remove: jest.Mock; merge: jest.Mock; save: jest.Mock };
    let mediaRefs: { deleteUnusedKeys: jest.Mock };

    beforeEach(() => {
        repo = {
            findOne: jest.fn(),
            remove: jest.fn((x: Certification) => Promise.resolve(x)),
            merge: jest.fn((b: Certification, p: Partial<Certification>) =>
                Object.assign(b, p),
            ),
            save: jest.fn((x: Certification) => Promise.resolve(x)),
        };
        mediaRefs = { deleteUnusedKeys: jest.fn().mockResolvedValue(undefined) };
        service = new CertificationsService(
            repo as unknown as Repository<Certification>,
            { publicUrl: (k: string) => `https://cdn/${k}` } as StorageService,
            mediaRefs as unknown as MediaReferencesService,
        );
    });

    it('removePermanent elimina una que está en la papelera, con logo y PDF', async () => {
        repo.findOne.mockResolvedValue(
            makeCertification({ deletedAt: new Date() }),
        );

        await service.removePermanent('c1');

        expect(repo.remove).toHaveBeenCalled();
        expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith([
            'media/logo.png',
            'media/cert.pdf',
        ]);
    });

    it('removePermanent RECHAZA una que no está en la papelera', async () => {
        repo.findOne.mockResolvedValue(makeCertification({ deletedAt: null }));

        await expect(service.removePermanent('c1')).rejects.toThrow(
            ConflictException,
        );
        expect(repo.remove).not.toHaveBeenCalled();
        expect(mediaRefs.deleteUnusedKeys).not.toHaveBeenCalled();
    });

    it('cambiar el logo no toca el PDF, que sigue en uso', async () => {
        repo.findOne.mockResolvedValue(makeCertification());

        await service.update('c1', { logoImage: 'media/nuevo.png' });

        expect(mediaRefs.deleteUnusedKeys).toHaveBeenCalledWith([
            'media/logo.png',
        ]);
    });
});
