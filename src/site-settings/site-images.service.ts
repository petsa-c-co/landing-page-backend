import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteImage } from './entities/site-image.entity';
import { UpdateSiteImageDto } from './dto/update-site-image.dto';
import { StorageService } from '@/storage/storage.service';
import { orphanKeys } from '@/common/utils/orphan-keys.util';
import { MediaReferencesService } from '@/media/media-references.service';

/** Mapa slot -> URL absoluta. Los slots sin imagen cargada no aparecen. */
export type SiteImagesView = Record<string, string>;

/**
 * Imágenes de cabecera de las páginas fijas, por slot. Sin papelera ni
 * histórico: un slot se pisa y listo.
 */
@Injectable()
export class SiteImagesService {
    constructor(
        @InjectRepository(SiteImage)
        private readonly siteImageRepository: Repository<SiteImage>,
        private readonly storageService: StorageService,
        private readonly mediaReferences: MediaReferencesService,
    ) {}

    /**
     * GET público. Devuelve solo los slots con imagen cargada: el frontend
     * tiene una imagen por defecto en su código para los que falten, así que
     * un mapa vacío es un estado válido (nunca 404).
     */
    async findAll(): Promise<SiteImagesView> {
        const images = await this.siteImageRepository.find({
            order: { slot: 'ASC' },
        });
        return images.reduce<SiteImagesView>((acc, image) => {
            acc[image.slot] = this.storageService.publicUrl(image.imageKey);
            return acc;
        }, {});
    }

    /**
     * Asigna o limpia la imagen de un slot y devuelve el mapa completo ya
     * actualizado (así el panel refresca de una sola vez).
     *
     * `imageKey` en null —o ausente— limpia el slot: este recurso tiene un solo
     * campo editable, así que no hay un "no tocar" que distinguir.
     */
    async update(dto: UpdateSiteImageDto): Promise<SiteImagesView> {
        const existing = await this.siteImageRepository.findOne({
            where: { slot: dto.slot },
        });
        const previousKey = existing?.imageKey ?? null;
        const nextKey = dto.imageKey ?? null;

        if (!nextKey) {
            if (existing) {
                await this.siteImageRepository.remove(existing);
            }
        } else if (existing) {
            existing.imageKey = nextKey;
            await this.siteImageRepository.save(existing);
        } else {
            await this.siteImageRepository.save(
                this.siteImageRepository.create({
                    slot: dto.slot,
                    imageKey: nextKey,
                }),
            );
        }

        // La imagen anterior se borra recién DESPUÉS de persistir: si el guardado
        // fallara, el slot seguiría apuntando a esa key y no debe quedar roto.
        // deleteUnusedKeys además verifica que ningún OTRO slot ni otra entidad
        // esté usando esa misma imagen.
        await this.mediaReferences.deleteUnusedKeys(
            orphanKeys([previousKey], [nextKey]),
        );

        return this.findAll();
    }
}
