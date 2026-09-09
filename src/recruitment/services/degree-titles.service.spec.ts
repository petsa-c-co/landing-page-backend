import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DegreeTitlesService } from './degree-titles.service';
import { DegreeTitle } from '../entities/degree-title.entity';
import { DegreeTitleLevel } from '../enum/degree-title-level.enum';

const makeTitle = (over: Partial<DegreeTitle> = {}): DegreeTitle =>
    ({
        id: 't1',
        name: 'Técnico Mecánico',
        level: DegreeTitleLevel.SECUNDARIO_TECNICO,
        isActive: true,
        sortOrder: 0,
        deletedAt: null,
        ...over,
    }) as DegreeTitle;

describe('DegreeTitlesService', () => {
    let service: DegreeTitlesService;
    let repo: { findOne: jest.Mock; remove: jest.Mock; recover: jest.Mock };

    beforeEach(() => {
        repo = {
            findOne: jest.fn(),
            remove: jest.fn((x: DegreeTitle) => Promise.resolve(x)),
            recover: jest.fn((x: DegreeTitle) => Promise.resolve(x)),
        };
        service = new DegreeTitlesService(
            repo as unknown as Repository<DegreeTitle>,
        );
    });

    it('removePermanent elimina uno que está en la papelera', async () => {
        repo.findOne.mockResolvedValue(makeTitle({ deletedAt: new Date() }));

        await service.removePermanent('t1');

        expect(repo.remove).toHaveBeenCalled();
    });

    /**
     * El catálogo de títulos lo consume el formulario público: borrar por error
     * uno vivo lo saca del autocompletado sin forma de recuperarlo.
     */
    it('removePermanent RECHAZA uno que no está en la papelera', async () => {
        repo.findOne.mockResolvedValue(makeTitle({ deletedAt: null }));

        await expect(service.removePermanent('t1')).rejects.toThrow(
            ConflictException,
        );
        expect(repo.remove).not.toHaveBeenCalled();
    });

    it('404 si no existe', async () => {
        repo.findOne.mockResolvedValue(null);

        await expect(service.removePermanent('t1')).rejects.toThrow(
            NotFoundException,
        );
    });
});
