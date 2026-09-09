import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common';
import { StorageService, UploadedMedia } from '@/storage/storage.service';
import { MediaReferencesService } from './media-references.service';
import { detectFileType } from '@/storage/utils/file-signature.util';

// Tipos de imagen admitidos para contenido del sitio. SVG queda excluido a
// propósito (puede embeber scripts) y PDF no es una imagen.
const IMAGE_CONTENT_TYPES: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
};

@Injectable()
export class MediaService {
    constructor(
        private readonly storageService: StorageService,
        private readonly mediaReferences: MediaReferencesService,
    ) {}

    async uploadImage(file: Express.Multer.File): Promise<UploadedMedia> {
        // Tipo REAL por magic bytes; el mimetype del cliente no se usa.
        const detected = detectFileType(file.buffer);
        if (!detected || !(detected in IMAGE_CONTENT_TYPES)) {
            throw new BadRequestException(
                'La imagen debe ser un archivo PNG, JPEG o WebP válido',
            );
        }
        const extension = detected === 'jpeg' ? 'jpg' : detected;
        return this.storageService.uploadMedia(
            file.buffer,
            IMAGE_CONTENT_TYPES[detected],
            extension,
        );
    }

    // Documento PÚBLICO en PDF (p. ej. certificado ISO). Va al MISMO bucket
    // público que las imágenes (misma prefix 'media/'), pero por un endpoint
    // aparte para no debilitar la garantía "solo imágenes" de uploadImage.
    async uploadDocument(file: Express.Multer.File): Promise<UploadedMedia> {
        if (detectFileType(file.buffer) !== 'pdf') {
            throw new BadRequestException(
                'El documento debe ser un archivo PDF válido',
            );
        }
        return this.storageService.uploadMedia(
            file.buffer,
            'application/pdf',
            'pdf',
        );
    }

    /**
     * Borra un archivo del bucket público SOLO si ninguna entidad lo referencia
     * (incluida la papelera: un item borrado en soft conserva su archivo para
     * poder restaurarse). Sin este chequeo, borrar una key en uso dejaría
     * imágenes/PDFs rotos en el sitio.
     */
    async deleteImage(key: string): Promise<void> {
        const enUsoPor = await this.mediaReferences.findReference(key);
        if (enUsoPor) {
            throw new ConflictException(
                `El archivo está en uso por ${enUsoPor} (o por un registro en la papelera). ` +
                    'Quitalo de ese registro, o eliminá ese registro definitivamente, antes de borrarlo.',
            );
        }
        await this.storageService.deleteMedia(key);
    }
}
