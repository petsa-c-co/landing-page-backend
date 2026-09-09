import {
    BadRequestException,
    Controller,
    Delete,
    Post,
    Query,
    UploadedFile,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { UploadedMedia } from '@/storage/storage.service';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { SingleFileUpload } from '@/common/decorators/single-file-upload.decorator';
import {
    MAX_DOCUMENT_SIZE_BYTES,
    MAX_IMAGE_SIZE_BYTES,
} from '@/storage/storage.constants';

@Controller('media')
export class MediaController {
    constructor(private readonly mediaService: MediaService) {}

    // RRHH también puede subir (portadas de novedades); el resto del contenido
    // lo administra el admin, pero la subida en sí no es destructiva.
    @Post('uploads')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH, UserRoles.AUDITOR)
    @SingleFileUpload('file', MAX_IMAGE_SIZE_BYTES)
    @ResponseMessage('Imagen subida correctamente')
    uploadImage(
        @UploadedFile() file: Express.Multer.File | undefined,
    ): Promise<UploadedMedia> {
        if (!file) {
            throw new BadRequestException(
                'Falta el archivo (campo "file" del formulario)',
            );
        }
        return this.mediaService.uploadImage(file);
    }

    // Documentos públicos en PDF (p. ej. certificados ISO descargables). Va por
    // un endpoint aparte para no aceptar PDF en /uploads (que garantiza
    // "solo imágenes" a servicios/clientes/novedades).
    @Post('documents')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH, UserRoles.AUDITOR)
    @SingleFileUpload('file', MAX_DOCUMENT_SIZE_BYTES)
    @ResponseMessage('Documento subido correctamente')
    uploadDocument(
        @UploadedFile() file: Express.Multer.File | undefined,
    ): Promise<UploadedMedia> {
        if (!file) {
            throw new BadRequestException(
                'Falta el archivo (campo "file" del formulario)',
            );
        }
        return this.mediaService.uploadDocument(file);
    }

    // Borra cualquier archivo del bucket público por su key (imágenes o PDFs;
    // ambos comparten la prefix 'media/').
    @Delete('uploads')
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Archivo eliminado correctamente')
    async deleteImage(@Query('key') key?: string): Promise<void> {
        if (!key) {
            throw new BadRequestException('Falta el parámetro "key"');
        }
        await this.mediaService.deleteImage(key);
    }
}
