import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { DegreeTitle } from '../entities/degree-title.entity';
import { DegreeTitleLevel } from '../enum/degree-title-level.enum';
import { CreateDegreeTitleDto } from '../dto/create-degree-title.dto';
import { UpdateDegreeTitleDto } from '../dto/update-degree-title.dto';
import { DegreeTitlesAdminQueryDto } from '../dto/degree-titles-admin-query.dto';
import { paginate } from '@/common/utils/pagination.util';
import { accentInsensitiveLike } from '@/common/utils/accent-insensitive.util';
import {
    restoreConflictException,
    uniqueConflictException,
} from '@/common/utils/unique-conflict.util';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';

@Injectable()
export class DegreeTitlesService {
    constructor(
        @InjectRepository(DegreeTitle)
        private readonly degreeTitleRepository: Repository<DegreeTitle>,
    ) {}

    // Alimenta el autocompletado del formulario público.
    findAllActive(level?: DegreeTitleLevel): Promise<DegreeTitle[]> {
        const where: FindOptionsWhere<DegreeTitle> = { isActive: true };
        if (level) {
            where.level = level;
        }
        return this.degreeTitleRepository.find({
            where,
            order: { sortOrder: 'ASC', name: 'ASC' },
        });
    }

    // Tabla de administración: paginada, con filtro por nivel y búsqueda por
    // nombre. Incluye los inactivos (a diferencia del endpoint público).
    async findAllAdmin(
        query: DegreeTitlesAdminQueryDto,
    ): Promise<PaginatedResult<DegreeTitle>> {
        const qb = this.degreeTitleRepository
            .createQueryBuilder('title')
            .orderBy('title.sortOrder', 'ASC')
            .addOrderBy('title.name', 'ASC')
            .skip((query.page - 1) * query.limit)
            .take(query.limit);

        if (query.level) {
            qb.andWhere('title.level = :level', { level: query.level });
        }
        if (query.search) {
            // Búsqueda por nombre, insensible a mayúsculas y acentos
            // ("tecnico" encuentra "Técnico").
            qb.andWhere(accentInsensitiveLike('title.name', 'search'), {
                search: `%${query.search}%`,
            });
        }

        const [items, total] = await qb.getManyAndCount();
        return paginate(items, total, query);
    }

    async findActiveById(id: string): Promise<DegreeTitle | null> {
        return this.degreeTitleRepository.findOne({
            where: { id, isActive: true },
        });
    }

    // El nombre es único. withDeleted: un título en la papelera sigue
    // "reservando" su nombre (el índice único de la BD también lo cuenta), así
    // que se avisa con un 409 claro en vez de un error crudo de Postgres.
    private async assertNameAvailable(
        name: string,
        excludeId?: string,
    ): Promise<void> {
        const existing = await this.degreeTitleRepository.findOne({
            where: { name },
            withDeleted: true,
        });
        if (existing && existing.id !== excludeId) {
            throw uniqueConflictException('un título', {
                id: existing.id,
                field: 'name',
                value: name,
                inTrash: existing.deletedAt !== null,
            });
        }
    }

    // Al restaurar: ningún título ACTIVO puede estar usando ese nombre.
    private async assertNameFreeForRestore(
        degreeTitle: DegreeTitle,
    ): Promise<void> {
        const holder = await this.degreeTitleRepository.findOne({
            where: { name: degreeTitle.name },
        });
        if (holder && holder.id !== degreeTitle.id) {
            throw restoreConflictException('un título', {
                id: holder.id,
                field: 'name',
                value: degreeTitle.name,
                inTrash: false,
            });
        }
    }

    async create(createDto: CreateDegreeTitleDto): Promise<DegreeTitle> {
        await this.assertNameAvailable(createDto.name);
        const degreeTitle = this.degreeTitleRepository.create(createDto);
        return this.degreeTitleRepository.save(degreeTitle);
    }

    async update(
        id: string,
        updateDto: UpdateDegreeTitleDto,
    ): Promise<DegreeTitle> {
        const degreeTitle = await this.degreeTitleRepository.findOne({
            where: { id },
        });
        if (!degreeTitle) {
            throw new NotFoundException('El título no existe');
        }
        if (updateDto.name && updateDto.name !== degreeTitle.name) {
            await this.assertNameAvailable(updateDto.name, id);
        }
        const merged = this.degreeTitleRepository.merge(
            degreeTitle,
            updateDto,
        );
        return this.degreeTitleRepository.save(merged);
    }

    // Borrado suave: va a la papelera. Las postulaciones conservan su
    // referencia al título mientras esté en la papelera (no se pone en NULL).
    async remove(id: string): Promise<void> {
        const degreeTitle = await this.degreeTitleRepository.findOne({
            where: { id },
        });
        if (!degreeTitle) {
            throw new NotFoundException('El título no existe');
        }
        await this.degreeTitleRepository.softRemove(degreeTitle);
    }

    // Papelera: títulos borrados, más recientes primero.
    findTrash(): Promise<DegreeTitle[]> {
        return this.degreeTitleRepository.find({
            withDeleted: true,
            where: { deletedAt: Not(IsNull()) },
            order: { deletedAt: 'DESC' },
        });
    }

    async restore(id: string): Promise<DegreeTitle> {
        const degreeTitle = await this.degreeTitleRepository.findOne({
            where: { id },
            withDeleted: true,
        });
        if (!degreeTitle) {
            throw new NotFoundException('El título no existe');
        }
        if (!degreeTitle.deletedAt) {
            throw new ConflictException('El título no está en la papelera');
        }
        // Defensivo: la papelera reserva el nombre (ver assertNameAvailable).
        await this.assertNameFreeForRestore(degreeTitle);
        return this.degreeTitleRepository.recover(degreeTitle);
    }

    // Borrado físico definitivo desde la papelera. Bloqueado mientras haya
    // postulaciones que lo referencien: eliminarlo las dejaría con degreeTitle
    // NULL (ON DELETE SET NULL) y ese dato histórico no se pierde por un click.
    // Cuando la purga por retención elimine esas postulaciones, se libera.
    async removePermanent(id: string): Promise<void> {
        const degreeTitle = await this.degreeTitleRepository.findOne({
            where: { id },
            withDeleted: true,
        });
        if (!degreeTitle) {
            throw new NotFoundException('El título no existe');
        }
        // Simétrico con restore(): el borrado definitivo es la SALIDA de la
        // papelera, así que exige haber entrado. Sin esto, un id de un registro
        // vivo lo destruye —a él y a sus archivos— sin vuelta atrás.
        if (!degreeTitle.deletedAt) {
            throw new ConflictException(
                'El título no está en la papelera. Enviálo primero a la papelera para poder eliminarlo definitivamente.',
            );
        }
        // Antes acá se comprobaba que ninguna postulación lo referenciara.
        // Ya no hace falta: las postulaciones viven en Gestión Petrogas y allá
        // el título queda guardado por NOMBRE (les mandamos degreeTitleName
        // junto al id), así que borrarlo de este catálogo no deja huérfano
        // ningún dato de ellos.
        await this.degreeTitleRepository.remove(degreeTitle);
    }
}
