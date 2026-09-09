// Detección del tipo REAL de un archivo por sus primeros bytes (magic bytes).
// No se confía en el mimetype ni en la extensión que declara el cliente: un
// .exe renombrado a .pdf se rechaza aquí. SVG queda deliberadamente fuera
// (puede embeber scripts -> XSS si se sirve como imagen).

export type DetectedFileType = 'pdf' | 'png' | 'jpeg' | 'webp';

const PDF_SIGNATURE = Buffer.from('%PDF-');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_SIGNATURE = Buffer.from('RIFF');
const WEBP_SIGNATURE = Buffer.from('WEBP');

export function detectFileType(buffer: Buffer): DetectedFileType | null {
    if (buffer.length < 12) {
        return null;
    }
    if (buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
        return 'pdf';
    }
    if (buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        return 'png';
    }
    if (buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
        return 'jpeg';
    }
    // WebP: contenedor RIFF con el fourcc "WEBP" en los bytes 8..12.
    if (
        buffer.subarray(0, RIFF_SIGNATURE.length).equals(RIFF_SIGNATURE) &&
        buffer.subarray(8, 12).equals(WEBP_SIGNATURE)
    ) {
        return 'webp';
    }
    return null;
}
