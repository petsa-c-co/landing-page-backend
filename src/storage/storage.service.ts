import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { MEDIA_KEY_PREFIX } from './storage.constants';

export interface UploadedMedia {
    key: string;
    url: string;
}

/**
 * Almacenamiento de archivos sobre el FILESYSTEM (un montaje NFS en producción,
 * una carpeta local en desarrollo). Reemplaza al bucket S3/R2 que se usaba
 * antes; para el código de arriba nada cambia: se sigue guardando una `key` en
 * la base y se expone una URL absoluta.
 *
 * Hay UNA sola raíz bajo STORAGE_PATH:
 *   public/   → imágenes y PDFs del sitio (prefijo `media/`), servida entera
 *               por HTTP desde main.ts.
 *
 * No existe un área privada, y este servicio no sabe escribir fuera de public/.
 * Todo lo que entre acá es, por definición, público: si mañana hace falta
 * guardar algo que no deba publicarse, hay que escribir código nuevo, no elegir
 * otro prefijo. (Los CV de las postulaciones no pasan por acá: se reenvían a
 * Gestión Petrogas sin tocar disco.)
 *
 * Lo que sí es estructural es el encierro: aunque una key viniera manipulada,
 * no puede salir de la raíz pública (ver resolveInside).
 */
@Injectable()
export class StorageService {
    private readonly publicRoot: string;
    private readonly publicBaseUrl: string;

    constructor(private readonly configService: ConfigService) {
        const root = path.resolve(
            this.configService.get<string>('STORAGE_PATH') ?? './storage',
        );
        this.publicRoot = path.join(root, 'public');
        this.publicBaseUrl = (
            this.configService.get<string>('MEDIA_PUBLIC_BASE_URL') ?? ''
        ).replace(/\/+$/, '');
    }

    /** URL pública de una key del área pública. */
    publicUrl(key: string): string {
        return `${this.publicBaseUrl}/${key}`;
    }

    /**
     * Convierte una key en ruta absoluta y verifica que caiga DENTRO de la raíz
     * indicada. Corta cualquier intento de salirse con `..` o rutas absolutas
     * (path traversal), que en un filesystem sí es un riesgo real —a diferencia
     * de S3, donde la key era solo un nombre de objeto—.
     */
    private resolveInside(root: string, key: string): string {
        const full = path.resolve(root, key);
        const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
        if (full !== root && !full.startsWith(rootWithSep)) {
            throw new BadRequestException('La ruta del archivo no es válida');
        }
        return full;
    }

    /**
     * Escribe el archivo de forma ATÓMICA: primero a un temporal en el mismo
     * directorio y después rename. Así un lector nunca ve un archivo a medio
     * escribir (importante en NFS, donde la escritura puede ser lenta).
     */
    private async writeAtomic(fullPath: string, buffer: Buffer): Promise<void> {
        await mkdir(path.dirname(fullPath), { recursive: true });
        const tmp = `${fullPath}.${randomUUID()}.tmp`;
        try {
            await writeFile(tmp, buffer);
            await rename(tmp, fullPath);
        } catch (err) {
            await rm(tmp, { force: true }).catch(() => undefined);
            throw err;
        }
    }

    /** Sube un archivo público. Devuelve la key (para la DB) y su URL. */
    async uploadMedia(
        buffer: Buffer,
        _contentType: string,
        extension: string,
    ): Promise<UploadedMedia> {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        // Misma forma de key que con R2: los registros ya guardados siguen
        // siendo válidos.
        const key = `${MEDIA_KEY_PREFIX}${year}/${month}/${randomUUID()}.${extension}`;

        await this.writeAtomic(
            this.resolveInside(this.publicRoot, key),
            buffer,
        );
        return { key, url: this.publicUrl(key) };
    }

    async deleteMedia(key: string): Promise<void> {
        if (!key.startsWith(MEDIA_KEY_PREFIX)) {
            throw new BadRequestException(
                'La key no pertenece al almacenamiento de imágenes',
            );
        }
        await rm(this.resolveInside(this.publicRoot, key), { force: true });
    }
}
