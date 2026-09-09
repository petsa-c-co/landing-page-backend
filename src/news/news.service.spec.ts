import { Repository } from 'typeorm';
import { NewsService } from './news.service';
import { NewsPost } from './entities/news-post.entity';
import { NewsCategory } from './enum/news-category.enum';
import { StorageService } from '@/storage/storage.service';
import { MediaReferencesService } from '@/media/media-references.service';

const makePost = (over: Partial<NewsPost> = {}): NewsPost =>
    ({
        id: 'n1',
        title: 'Nota',
        slug: 'nota',
        category: NewsCategory.NOVEDADES,
        publishedAt: new Date(),
        coverImage: null,
        excerpt: 'e',
        body: 'b',
        isFeatured: false,
        isPublished: true,
        deletedAt: null,
        ...over,
    }) as NewsPost;

describe('NewsService (destacada única)', () => {
    let service: NewsService;
    // EntityManager transaccional: el save y la des-marcación van juntos.
    let em: { save: jest.Mock; findOne: jest.Mock };
    let repo: {
        findOne: jest.Mock;
        create: jest.Mock;
        merge: jest.Mock;
        recover: jest.Mock;
        save: jest.Mock;
        manager: { transaction: jest.Mock };
    };

    beforeEach(() => {
        em = {
            save: jest.fn((x: NewsPost) => Promise.resolve(x)),
            findOne: jest.fn().mockResolvedValue(null),
        };
        repo = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((x: Partial<NewsPost>) => x as NewsPost),
            merge: jest.fn((base: NewsPost, patch: Partial<NewsPost>) =>
                Object.assign(base, patch),
            ),
            recover: jest.fn((x: NewsPost) => Promise.resolve(x)),
            save: jest.fn((x: NewsPost) => Promise.resolve(x)),
            manager: {
                transaction: jest.fn(
                    (
                        fn: (m: typeof em) => Promise<NewsPost>,
                    ): Promise<NewsPost> => fn(em),
                ),
            },
        };
        service = new NewsService(
            repo as unknown as Repository<NewsPost>,
            {
                publicUrl: jest.fn((k: string) => `https://cdn/${k}`),
            } as unknown as StorageService,
            {
                deleteUnusedKeys: jest.fn().mockResolvedValue(undefined),
            } as unknown as MediaReferencesService,
        );
    });

    it('crear una nota destacada des-marca la anterior en la transacción', async () => {
        em.save.mockImplementation((x: NewsPost) =>
            Promise.resolve({ ...x, id: 'nueva' }),
        );

        await service.create({
            title: 'Destacada',
            category: NewsCategory.NOVEDADES,
            excerpt: 'e',
            body: 'b',
            isFeatured: true,
        });

        expect(repo.manager.transaction).toHaveBeenCalled();
        // Se busca la destacada anterior y se la guarda des-marcada. Va por
        // save() y no por update() para que el registro de cambios pueda ver el
        // estado previo (ver el comentario en news.service.ts).
        expect(em.findOne).toHaveBeenCalledWith(
            NewsPost,
            expect.objectContaining<{ where: unknown }>({
                where: expect.objectContaining({ isFeatured: true }) as unknown,
            }),
        );
    });

    it('crear/actualizar SIN destacar no toca a las demás (cero destacadas es válido)', async () => {
        await service.create({
            title: 'Común',
            category: NewsCategory.NOVEDADES,
            excerpt: 'e',
            body: 'b',
        });
        expect(em.findOne).not.toHaveBeenCalled();

        // PATCH { isFeatured: false } tampoco dispara la des-marcación.
        repo.findOne.mockResolvedValue(makePost({ isFeatured: true }));
        await service.update('n1', { isFeatured: false });
        expect(em.findOne).not.toHaveBeenCalled();
    });

    it('marcar destacada por PATCH des-marca la anterior', async () => {
        repo.findOne.mockResolvedValue(makePost());

        await service.update('n1', { isFeatured: true });

        expect(em.findOne).toHaveBeenCalledWith(
            NewsPost,
            expect.objectContaining<{ where: unknown }>({
                where: expect.objectContaining({ isFeatured: true }) as unknown,
            }),
        );
    });

    describe('restore de una nota que estaba destacada', () => {
        it('si mientras tanto se destacó OTRA, vuelve sin destacar', async () => {
            repo.findOne
                // la nota a restaurar (destacada, en papelera)
                .mockResolvedValueOnce(
                    makePost({ isFeatured: true, deletedAt: new Date() }),
                )
                // chequeo de slug libre
                .mockResolvedValueOnce(null)
                // hay otra destacada viva
                .mockResolvedValueOnce(makePost({ id: 'otra' }));

            const restored = await service.restore('n1');

            expect(restored.isFeatured).toBe(false);
            expect(repo.recover).toHaveBeenCalled();
            // recover() no persiste campos: el des-marcado va por save().
            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({ isFeatured: false }),
            );
        });

        it('si NO hay otra destacada, conserva la suya', async () => {
            repo.findOne
                .mockResolvedValueOnce(
                    makePost({ isFeatured: true, deletedAt: new Date() }),
                )
                .mockResolvedValueOnce(null) // slug libre
                .mockResolvedValueOnce(null); // ninguna otra destacada

            const restored = await service.restore('n1');

            expect(restored.isFeatured).toBe(true);
            expect(repo.save).not.toHaveBeenCalled();
        });
    });
});
