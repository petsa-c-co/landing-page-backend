import { ConfigService } from '@nestjs/config';
import { resolveLinkedInSource } from './news.module';
import { LinkedInApiSource } from './linkedin/linkedin-api.source';
import { LinkedInStubSource } from './linkedin/linkedin-stub.source';

const config = (valores: Record<string, string>): ConfigService =>
    ({ get: (clave: string) => valores[clave] }) as unknown as ConfigService;

describe('resolveLinkedInSource', () => {
    it('en desarrollo, sin modo definido, usa el stub', () => {
        expect(resolveLinkedInSource(config({}))).toBeInstanceOf(
            LinkedInStubSource,
        );
    });

    it('con LINKEDIN_FETCH_MODE=api usa la fuente real', () => {
        expect(
            resolveLinkedInSource(config({ LINKEDIN_FETCH_MODE: 'api' })),
        ).toBeInstanceOf(LinkedInApiSource);
    });

    /**
     * El caso que motiva la regla: el .env.prod real tiene
     * LINKEDIN_FETCH_MODE=stub, porque LinkedIn todavía no aprobó el acceso al
     * producto. Con el stub activo, el sync llena la cola de curaduría con dos
     * posteos inventados a nombre de "Petrogas S.A." que en el panel se ven
     * idénticos a los reales, y aprobar uno lo publica en el sitio.
     */
    it('en producción NUNCA usa el stub, aunque la variable diga stub', () => {
        expect(
            resolveLinkedInSource(
                config({ NODE_ENV: 'production', LINKEDIN_FETCH_MODE: 'stub' }),
            ),
        ).toBeInstanceOf(LinkedInApiSource);
    });

    it('en producción sin la variable tampoco usa el stub', () => {
        expect(
            resolveLinkedInSource(config({ NODE_ENV: 'production' })),
        ).toBeInstanceOf(LinkedInApiSource);
    });
});
