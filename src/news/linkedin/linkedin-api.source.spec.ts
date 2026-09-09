import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LinkedInApiSource } from './linkedin-api.source';

// ConfigService falso que resuelve desde un mapa.
const configOf = (map: Record<string, string | undefined>): ConfigService =>
    ({ get: (key: string) => map[key] }) as unknown as ConfigService;

const CONFIGURED = {
    LINKEDIN_ACCESS_TOKEN: 'tok-123',
    LINKEDIN_ORGANIZATION_URN: 'urn:li:organization:99',
    LINKEDIN_API_VERSION: '202401',
    LINKEDIN_API_BASE_URL: 'https://api.linkedin.com',
};

const asResponse = (body: unknown, ok = true, status = 200): Response =>
    ({
        ok,
        status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    }) as unknown as Response;

describe('LinkedInApiSource', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        fetchSpy = jest.spyOn(globalThis, 'fetch');
    });
    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('lanza 503 si faltan credenciales', async () => {
        const source = new LinkedInApiSource(
            configOf({ LINKEDIN_ACCESS_TOKEN: undefined }),
        );
        await expect(source.fetchRecentPosts()).rejects.toThrow(
            ServiceUnavailableException,
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('mapea los posteos de la respuesta de la Posts API', async () => {
        fetchSpy.mockResolvedValue(
            asResponse({
                elements: [
                    {
                        id: 'urn:li:share:100',
                        commentary: 'Hola mundo',
                        createdAt: 1721476800000,
                    },
                ],
            }),
        );

        const posts = await new LinkedInApiSource(
            configOf(CONFIGURED),
        ).fetchRecentPosts();

        expect(posts).toEqual([
            {
                externalId: 'urn:li:share:100',
                url: 'https://www.linkedin.com/feed/update/urn:li:share:100',
                text: 'Hola mundo',
                mediaUrl: null,
                authorName: null,
                postedAt: new Date(1721476800000),
            },
        ]);
    });

    it('resuelve la URL de imagen vía /rest/images', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                asResponse({
                    elements: [
                        {
                            id: 'urn:li:share:200',
                            commentary: 'Con imagen',
                            createdAt: 1721476800000,
                            content: { media: { id: 'urn:li:image:abc' } },
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                asResponse({ downloadUrl: 'https://cdn.li/img/abc.png' }),
            );

        const posts = await new LinkedInApiSource(
            configOf(CONFIGURED),
        ).fetchRecentPosts();

        expect(posts[0].mediaUrl).toBe('https://cdn.li/img/abc.png');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('propaga un error claro si LinkedIn responde con error', async () => {
        fetchSpy.mockResolvedValue(asResponse({ message: 'nope' }, false, 401));

        await expect(
            new LinkedInApiSource(configOf(CONFIGURED)).fetchRecentPosts(),
        ).rejects.toThrow(ServiceUnavailableException);
    });
});
