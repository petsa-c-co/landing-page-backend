import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Certification } from './entities/certification.entity';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { StorageService } from '@/storage/storage.service';
import { orphanKeys } from '@/common/utils/orphan-keys.util';
import { MediaReferencesService } from '@/media/media-references.service';

// Los archivos que guarda una certificación: el logo y el certificado en PDF.
const fileKeys = (c: Certification): (string | null)[] => [
    c.logoImage,
    c.certificatePdf,
];

@Injectable()
export class CertificationsService {
    constructor(
        @InjectRepository(Certification)
        private readonly certificationRepository: Repository<Certification>,
        private readonly storageService: StorageService,
        private readonly mediaReferences: MediaReferencesService,
    ) {}

    // Las keys del almacenamiento (logo y certificado PDF) se convierten a URLs absolutas
    // del bucket público para el frontend. Se muta la instancia (queda
    // serializada por el interceptor global).
    private withPublicUrls(certification: Certification): Certification {
        for (const field of ['logoImage', 'certificatePdf'] as const) {
            const key = certification[field];
            if (key) {
                certification[field] = this.storageService.publicUrl(key);
            }
        }
        return certification;
    }

    // Borra una key del bucket público best-effort (no rompe la operación).
    async findAll(): Promise<Certification[]> {
        const certifications = await this.certificationRepository.find({
            order: { sortOrder: 'ASC' },
        });
        return certifications.map((c) => this.withPublicUrls(c));
    }

    async create(createDto: CreateCertificationDto): Promise<Certification> {
        const certification = this.certificationRepository.create(createDto);
        const saved = await this.certificationRepository.save(certification);
        return this.withPublicUrls(saved);
    }

    async update(
        id: string,
        updateDto: UpdateCertificationDto,
    ): Promise<Certification> {
        const certification = await this.certificationRepository.findOne({
            where: { id },
        });
        if (!certification) {
            throw new NotFoundException('La certificación no existe');
        }

        // Si se reemplaza el logo o el PDF, la key anterior se borra del almacenamiento
        // recién DESPUÉS del save: si el save falla, no debe quedar la entidad
        // apuntando a un archivo ya borrado.
        const keysPrevias = fileKeys(certification);

        const merged = this.certificationRepository.merge(
            certification,
            updateDto,
        );
        const saved = await this.certificationRepository.save(merged);
        await this.mediaReferences.deleteUnusedKeys(
            orphanKeys(keysPrevias, fileKeys(saved)),
        );
        return this.withPublicUrls(saved);
    }

    // Borrado suave: va a la papelera (no se toca el almacenamiento, para poder restaurar).
    async remove(id: string): Promise<void> {
        const certification = await this.certificationRepository.findOne({
            where: { id },
        });
        if (!certification) {
            throw new NotFoundException('La certificación no existe');
        }
        await this.certificationRepository.softRemove(certification);
    }

    // Papelera: certificaciones borradas, más recientes primero.
    async findTrash(): Promise<Certification[]> {
        const certifications = await this.certificationRepository.find({
            withDeleted: true,
            where: { deletedAt: Not(IsNull()) },
            order: { deletedAt: 'DESC' },
        });
        return certifications.map((c) => this.withPublicUrls(c));
    }

    async restore(id: string): Promise<Certification> {
        const certification = await this.certificationRepository.findOne({
            where: { id },
            withDeleted: true,
        });
        if (!certification) {
            throw new NotFoundException('La certificación no existe');
        }
        if (!certification.deletedAt) {
            throw new ConflictException(
                'La certificación no está en la papelera',
            );
        }
        await this.certificationRepository.recover(certification);
        return this.withPublicUrls(certification);
    }

    // Borrado físico definitivo desde la papelera: acá sí se limpia el almacenamiento.
    async removePermanent(id: string): Promise<void> {
        const certification = await this.certificationRepository.findOne({
            where: { id },
            withDeleted: true,
        });
        if (!certification) {
            throw new NotFoundException('La certificación no existe');
        }
        // Simétrico con restore(): el borrado definitivo es la SALIDA de la
        // papelera, así que exige haber entrado. Sin esto, un id de un registro
        // vivo lo destruye —a él y a sus archivos— sin vuelta atrás.
        if (!certification.deletedAt) {
            throw new ConflictException(
                'La certificación no está en la papelera. Enviála primero a la papelera para poder eliminarla definitivamente.',
            );
        }
        await this.certificationRepository.remove(certification);
        await this.mediaReferences.deleteUnusedKeys(
            fileKeys(certification).filter((k): k is string => !!k),
        );
    }
}
