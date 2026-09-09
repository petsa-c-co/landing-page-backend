import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaReferencesService } from './media-references.service';
import { StorageService } from '@/storage/storage.service';

// Buffers mínimos que disparan cada firma de magic bytes.
const pad = (buf: Buffer): Buffer => Buffer.concat([buf, Buffer.alloc(16)]);
const PDF = pad(Buffer.from('%PDF-1.7'));
const PNG = pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]));
const EXE = pad(Buffer.from('MZ\x90\x00')); // ejecutable disfrazado

const file = (buffer: Buffer): Express.Multer.File =>
    ({ buffer, originalname: 'x', size: buffer.length }) as Express.Multer.File;

describe('MediaService', () => {
    let service: MediaService;
    let uploadMedia: jest.Mock;
    let deleteMedia: jest.Mock;
    let findReference: jest.Mock;

    beforeEach(async () => {
        uploadMedia = jest
            .fn()
            .mockResolvedValue({ key: 'media/2026/07/x', url: 'http://x' });
        deleteMedia = jest.fn().mockResolvedValue(undefined);
        // null = la key está libre (ver MediaReferencesService).
        findReference = jest.fn().mockResolvedValue(null);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MediaService,
                {
                    provide: StorageService,
                    useValue: { uploadMedia, deleteMedia },
                },
                {
                    provide: MediaReferencesService,
                    useValue: { findReference },
                },
            ],
        }).compile();

        service = module.get<MediaService>(MediaService);
    });

    describe('uploadDocument (PDF público)', () => {
        it('acepta un PDF real y lo sube como application/pdf', async () => {
            await service.uploadDocument(file(PDF));
            expect(uploadMedia).toHaveBeenCalledWith(
                PDF,
                'application/pdf',
                'pdf',
            );
        });

        it('rechaza un archivo que no es PDF (magic bytes)', async () => {
            await expect(service.uploadDocument(file(EXE))).rejects.toThrow(
                BadRequestException,
            );
            expect(uploadMedia).not.toHaveBeenCalled();
        });

        it('rechaza una imagen enviada como documento', async () => {
            await expect(service.uploadDocument(file(PNG))).rejects.toThrow(
                BadRequestException,
            );
            expect(uploadMedia).not.toHaveBeenCalled();
        });
    });

    describe('uploadImage (sigue siendo solo imágenes)', () => {
        it('acepta un PNG real', async () => {
            await service.uploadImage(file(PNG));
            expect(uploadMedia).toHaveBeenCalledWith(PNG, 'image/png', 'png');
        });

        it('rechaza un PDF por el endpoint de imágenes', async () => {
            await expect(service.uploadImage(file(PDF))).rejects.toThrow(
                BadRequestException,
            );
            expect(uploadMedia).not.toHaveBeenCalled();
        });
    });

    describe('deleteImage (protección de keys en uso)', () => {
        it('409 si alguna entidad referencia la key', async () => {
            findReference.mockResolvedValueOnce('un servicio');

            await expect(
                service.deleteImage('media/2026/07/x.png'),
            ).rejects.toThrow(ConflictException);
            expect(deleteMedia).not.toHaveBeenCalled();
        });

        it('el 409 nombra qué la está usando, para que el panel lo muestre', async () => {
            findReference.mockResolvedValueOnce('una certificación');

            await expect(
                service.deleteImage('media/2026/07/x.png'),
            ).rejects.toThrow(/una certificación/);
        });

        it('borra una key huérfana', async () => {
            await service.deleteImage('media/2026/07/x.png');

            expect(findReference).toHaveBeenCalledWith('media/2026/07/x.png');
            expect(deleteMedia).toHaveBeenCalledWith('media/2026/07/x.png');
        });
    });
});
