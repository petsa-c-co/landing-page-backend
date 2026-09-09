import { detectFileType } from './file-signature.util';

describe('detectFileType (magic bytes)', () => {
    const pad = (buffer: Buffer): Buffer =>
        Buffer.concat([buffer, Buffer.alloc(16)]);

    it('detecta PDF por su firma %PDF-', () => {
        expect(detectFileType(pad(Buffer.from('%PDF-1.7')))).toBe('pdf');
    });

    it('detecta PNG', () => {
        expect(
            detectFileType(pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))),
        ).toBe('png');
    });

    it('detecta JPEG', () => {
        expect(detectFileType(pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])))).toBe(
            'jpeg',
        );
    });

    it('detecta WebP (RIFF + fourcc WEBP)', () => {
        const webp = Buffer.concat([
            Buffer.from('RIFF'),
            Buffer.from([0, 0, 0, 0]),
            Buffer.from('WEBP'),
            Buffer.alloc(8),
        ]);
        expect(detectFileType(webp)).toBe('webp');
    });

    it('rechaza un ejecutable renombrado (firma MZ)', () => {
        expect(detectFileType(pad(Buffer.from('MZ\x90\x00')))).toBeNull();
    });

    it('rechaza SVG/XML aunque diga ser imagen', () => {
        expect(detectFileType(pad(Buffer.from('<svg xmlns=')))).toBeNull();
    });

    it('rechaza buffers demasiado cortos', () => {
        expect(detectFileType(Buffer.from('%PDF-'))).toBeNull();
    });
});
