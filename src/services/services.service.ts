import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Service } from './entities/service.entity';
import { ServiceItem } from './entities/service-item.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { StorageService } from '@/storage/storage.service';
import { slugify } from '@/common/utils/slug.util';
import {
    restoreConflictException,
    uniqueConflictException,
} from '@/common/utils/unique-conflict.util';
import { orphanKeys } from '@/common/utils/orphan-keys.util';
import { MediaReferencesService } from '@/media/media-references.service';

// Las tres imágenes de un servicio. Se centraliza para que agregar un campo
// nuevo no obligue a acordarse de sumarlo también en la limpieza.
const imageKeys = (s: Service): (string | null)[] => [
    s.cardImage,
    s.bannerImage,
    s.detailImage,
];

@Injectable()
export class ServicesService {
    constructor(
        @InjectRepository(Service)
        private readonly serviceRepository: Repository<Service>,
        private readonly storageService: StorageService,
        private readonly mediaReferences: MediaReferencesService,
    ) {}

    // Las keys del almacenamiento se convierten a URLs absolutas para el frontend. Se muta
    // la instancia (queda serializada por el interceptor global).
    private withImageUrls(service: Service): Service {
        for (const field of [
            'cardImage',
            'bannerImage',
            'detailImage',
        ] as const) {
            const key = service[field];
            if (key) {
                service[field] = this.storageService.publicUrl(key);
            }
        }
        return service;
    }

    private async assertSlugAvailable(
        slug: string,
        excludeId?: string,
    ): Promise<void> {
        // withDeleted: un servicio en la papelera sigue "reservando" su slug
        // (índice único). Así el mensaje es claro en vez de un error crudo de
        // la BD, y restaurarlo nunca choca con otro activo.
        const existing = await this.serviceRepository.findOne({
            where: { slug },
            withDeleted: true,
        });
        if (existing && existing.id !== excludeId) {
            throw uniqueConflictException('un servicio', {
                id: existing.id,
                field: 'slug',
                value: slug,
                inTrash: existing.deletedAt !== null,
            });
        }
    }

    // Al restaurar: ningún registro ACTIVO puede estar usando ese slug (el
    // findOne sin withDeleted mira solo los no borrados).
    private async assertSlugFreeForRestore(service: Service): Promise<void> {
        const holder = await this.serviceRepository.findOne({
            where: { slug: service.slug },
        });
        if (holder && holder.id !== service.id) {
            throw restoreConflictException('un servicio', {
                id: holder.id,
                field: 'slug',
                value: service.slug,
                inTrash: false,
            });
        }
    }

    async findAllPublic(): Promise<Service[]> {
        const services = await this.serviceRepository.find({
            where: { isActive: true },
            relations: { items: true },
            order: { sortOrder: 'ASC', items: { sortOrder: 'ASC' } },
        });
        return services.map((s) => this.withImageUrls(s));
    }

    async findAllAdmin(): Promise<Service[]> {
        const services = await this.serviceRepository.find({
            relations: { items: true },
            order: { sortOrder: 'ASC', items: { sortOrder: 'ASC' } },
        });
        return services.map((s) => this.withImageUrls(s));
    }

    async findOneBySlug(slug: string): Promise<Service> {
        const service = await this.serviceRepository.findOne({
            where: { slug, isActive: true },
            relations: { items: true },
            order: { items: { sortOrder: 'ASC' } },
        });
        if (!service) {
            throw new NotFoundException('El servicio no existe');
        }
        return this.withImageUrls(service);
    }

    async create(createDto: CreateServiceDto): Promise<Service> {
        const slug = createDto.slug ?? slugify(createDto.title);
        await this.assertSlugAvailable(slug);

        const service = this.serviceRepository.create({
            ...createDto,
            slug,
            items: createDto.items?.map((item, index) => ({
                ...item,
                sortOrder: item.sortOrder ?? index,
            })),
        });
        const saved = await this.serviceRepository.save(service);
        return this.withImageUrls(saved);
    }

    async update(id: string, updateDto: UpdateServiceDto): Promise<Service> {
        const service = await this.serviceRepository.findOne({
            where: { id },
            relations: { items: true },
        });
        if (!service) {
            throw new NotFoundException('El servicio no existe');
        }

        // Slug ESTABLE: editar el título no cambia la URL pública (rompería
        // links compartidos e indexados). Solo cambia si se envía explícito.
        const newSlug = updateDto.slug ?? service.slug;
        if (newSlug !== service.slug) {
            await this.assertSlugAvailable(newSlug, id);
        }

        // Fotografía de las imágenes ANTES del merge. La limpieza se calcula
        // después del save comparando este conjunto contra el final: si se
        // compara campo por campo, intercambiar dos imágenes parece dos
        // reemplazos y termina borrando las dos, cuando las dos siguen en uso.
        const keysPrevias = imageKeys(service);

        const merged = this.serviceRepository.merge(service, {
            ...updateDto,
            slug: newSlug,
        });
        // Reemplazo total de items si el DTO los trae (orphanedRowAction
        // borra los que quedan fuera).
        if (updateDto.items) {
            merged.items = updateDto.items.map((item, index) =>
                this.serviceRepository.manager.create(ServiceItem, {
                    ...item,
                    sortOrder: item.sortOrder ?? index,
                }),
            );
        }
        const saved = await this.serviceRepository.save(merged);
        // Después del save: si el save fallara, la entidad seguiría apuntando a
        // las keys viejas y no deben estar borradas.
        await this.mediaReferences.deleteUnusedKeys(
            orphanKeys(keysPrevias, imageKeys(saved)),
        );
        return this.withImageUrls(saved);
    }

    // Borrado suave: va a la papelera (no se toca el almacenamiento, para poder restaurar).
    async remove(id: string): Promise<void> {
        const service = await this.serviceRepository.findOne({
            where: { id },
        });
        if (!service) {
            throw new NotFoundException('El servicio no existe');
        }
        await this.serviceRepository.softRemove(service);
    }

    // Papelera: servicios borrados, más recientes primero.
    async findTrash(): Promise<Service[]> {
        const services = await this.serviceRepository.find({
            withDeleted: true,
            where: { deletedAt: Not(IsNull()) },
            // Con items, como todos los demás caminos: si no, el mismo recurso
            // le llega al panel con dos formas distintas y un service.items.length
            // sobre esta respuesta revienta.
            relations: { items: true },
            order: { deletedAt: 'DESC', items: { sortOrder: 'ASC' } },
        });
        return services.map((s) => this.withImageUrls(s));
    }

    async restore(id: string): Promise<Service> {
        const service = await this.serviceRepository.findOne({
            where: { id },
            withDeleted: true,
            relations: { items: true },
            order: { items: { sortOrder: 'ASC' } },
        });
        if (!service) {
            throw new NotFoundException('El servicio no existe');
        }
        if (!service.deletedAt) {
            throw new ConflictException('El servicio no está en la papelera');
        }
        // Defensivo: la papelera reserva el slug, así que nadie activo debería
        // tenerlo. Si igual pasara, recuperarlo violaría el índice único.
        await this.assertSlugFreeForRestore(service);
        await this.serviceRepository.recover(service);
        return this.withImageUrls(service);
    }

    // Borrado físico definitivo desde la papelera: acá sí se limpia el almacenamiento.
    async removePermanent(id: string): Promise<void> {
        const service = await this.serviceRepository.findOne({
            where: { id },
            withDeleted: true,
        });
        if (!service) {
            throw new NotFoundException('El servicio no existe');
        }
        // Simétrico con restore(): el borrado definitivo es la SALIDA de la
        // papelera, así que exige haber entrado. Sin esto, un id de un registro
        // vivo lo destruye —a él y a sus archivos— sin vuelta atrás.
        if (!service.deletedAt) {
            throw new ConflictException(
                'El servicio no está en la papelera. Enviálo primero a la papelera para poder eliminarlo definitivamente.',
            );
        }
        await this.serviceRepository.remove(service);
        // La fila ya no existe: sus imágenes quedan sin uso salvo que otra
        // entidad las comparta, cosa que deleteUnusedKeys verifica.
        await this.mediaReferences.deleteUnusedKeys(
            imageKeys(service).filter((k): k is string => !!k),
        );
    }
}
