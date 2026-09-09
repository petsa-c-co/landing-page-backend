import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { StorageService } from '@/storage/storage.service';
import { orphanKeys } from '@/common/utils/orphan-keys.util';
import { MediaReferencesService } from '@/media/media-references.service';

@Injectable()
export class ClientsService {
    constructor(
        @InjectRepository(Client)
        private readonly clientRepository: Repository<Client>,
        private readonly storageService: StorageService,
        private readonly mediaReferences: MediaReferencesService,
    ) {}

    private withImageUrl(client: Client): Client {
        client.logoImage = this.storageService.publicUrl(client.logoImage);
        return client;
    }

    async findAllPublic(): Promise<Client[]> {
        const clients = await this.clientRepository.find({
            where: { isActive: true },
            order: { sortOrder: 'ASC' },
        });
        return clients.map((c) => this.withImageUrl(c));
    }

    async findAllAdmin(): Promise<Client[]> {
        const clients = await this.clientRepository.find({
            order: { sortOrder: 'ASC' },
        });
        return clients.map((c) => this.withImageUrl(c));
    }

    async create(createDto: CreateClientDto): Promise<Client> {
        const client = this.clientRepository.create(createDto);
        const saved = await this.clientRepository.save(client);
        return this.withImageUrl(saved);
    }

    async update(id: string, updateDto: UpdateClientDto): Promise<Client> {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client) {
            throw new NotFoundException('El cliente no existe');
        }

        // El logo anterior se borra del almacenamiento recién DESPUÉS del save: si el save
        // falla, la entidad no debe quedar apuntando a un archivo borrado.
        const keyPrevia = client.logoImage;

        const merged = this.clientRepository.merge(client, updateDto);
        const saved = await this.clientRepository.save(merged);
        await this.mediaReferences.deleteUnusedKeys(
            orphanKeys([keyPrevia], [saved.logoImage]),
        );
        return this.withImageUrl(saved);
    }

    // Borrado suave: va a la papelera (no se toca el almacenamiento, para poder restaurar).
    async remove(id: string): Promise<void> {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client) {
            throw new NotFoundException('El cliente no existe');
        }
        await this.clientRepository.softRemove(client);
    }

    // Papelera: clientes borrados, más recientes primero.
    async findTrash(): Promise<Client[]> {
        const clients = await this.clientRepository.find({
            withDeleted: true,
            where: { deletedAt: Not(IsNull()) },
            order: { deletedAt: 'DESC' },
        });
        return clients.map((c) => this.withImageUrl(c));
    }

    async restore(id: string): Promise<Client> {
        const client = await this.clientRepository.findOne({
            where: { id },
            withDeleted: true,
        });
        if (!client) {
            throw new NotFoundException('El cliente no existe');
        }
        if (!client.deletedAt) {
            throw new ConflictException('El cliente no está en la papelera');
        }
        await this.clientRepository.recover(client);
        return this.withImageUrl(client);
    }

    // Borrado físico definitivo desde la papelera: acá sí se limpia el almacenamiento.
    async removePermanent(id: string): Promise<void> {
        const client = await this.clientRepository.findOne({
            where: { id },
            withDeleted: true,
        });
        if (!client) {
            throw new NotFoundException('El cliente no existe');
        }
        // Simétrico con restore(): el borrado definitivo es la SALIDA de la
        // papelera, así que exige haber entrado. Sin esto, un id de un registro
        // vivo lo destruye —a él y a sus archivos— sin vuelta atrás.
        if (!client.deletedAt) {
            throw new ConflictException(
                'El cliente no está en la papelera. Enviálo primero a la papelera para poder eliminarlo definitivamente.',
            );
        }
        await this.clientRepository.remove(client);
        await this.mediaReferences.deleteUnusedKeys(
            [client.logoImage].filter((k): k is string => !!k),
        );
    }
}
