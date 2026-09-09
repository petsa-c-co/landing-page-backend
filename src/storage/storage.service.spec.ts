import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { StorageService } from './storage.service';

// Se prueba contra el filesystem de verdad (un directorio temporal), no contra
// un mock: lo que importa acá es dónde queda el archivo y qué rutas se
// rechazan.
describe('StorageService (filesystem)', () => {
    let service: StorageService;
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'petrogassa-storage-'));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StorageService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: (key: string) =>
                            ({
                                STORAGE_PATH: root,
                                MEDIA_PUBLIC_BASE_URL:
                                    'https://petrogassa.com/',
                            })[key],
                    },
                },
            ],
        }).compile();

        service = module.get<StorageService>(StorageService);
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    const publicPath = (key: string): string =>
        path.join(root, 'public', key);

    it('publicUrl normaliza la barra final de la base', () => {
        expect(service.publicUrl('media/2026/07/x.png')).toBe(
            'https://petrogassa.com/media/2026/07/x.png',
        );
    });

    it('uploadMedia escribe el archivo bajo public/ y devuelve key y URL', async () => {
        const result = await service.uploadMedia(
            Buffer.from('contenido-img'),
            'image/png',
            'png',
        );

        expect(result.key).toMatch(/^media\/\d{4}\/\d{2}\/[0-9a-f-]+\.png$/);
        expect(result.url).toBe(`https://petrogassa.com/${result.key}`);
        // El archivo existe de verdad y con el contenido correcto.
        expect(readFileSync(publicPath(result.key), 'utf8')).toBe(
            'contenido-img',
        );
    });

    it('no deja archivos temporales tras una subida', async () => {
        const { key } = await service.uploadMedia(
            Buffer.from('x'),
            'image/png',
            'png',
        );
        const dir = path.dirname(publicPath(key));
        const sobrantes = readdirSync(dir).filter((f) => f.endsWith('.tmp'));
        expect(sobrantes).toEqual([]);
    });

    it('deleteMedia borra el archivo', async () => {
        const { key } = await service.uploadMedia(
            Buffer.from('x'),
            'image/png',
            'png',
        );
        expect(existsSync(publicPath(key))).toBe(true);

        await service.deleteMedia(key);
        expect(existsSync(publicPath(key))).toBe(false);
    });

    it('borrar una key inexistente no falla (idempotente)', async () => {
        await expect(
            service.deleteMedia('media/2026/07/no-existe.png'),
        ).resolves.toBeUndefined();
    });

    describe('alcance del borrado', () => {
        // El almacenamiento solo administra el área pública (los CVs pasaron a
        // Gestión Petrogas). deleteMedia igual valida el prefijo: una key con
        // otra forma no debe poder borrar nada.
        it('rechaza una key que no sea de media', async () => {
            await expect(service.deleteMedia('cv/algo.pdf')).rejects.toThrow(
                BadRequestException,
            );
        });
    });

    describe('path traversal', () => {
        // Riesgo propio del filesystem que con S3 no existía: una key no puede
        // usarse para salir del directorio de almacenamiento.
        it('rechaza una key que intenta escapar con ..', async () => {
            await expect(
                service.deleteMedia('media/../../../etc/passwd'),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
