import { Logger } from '@nestjs/common';
import {
    FetchedLinkedInPost,
    LinkedInSource,
} from './linkedin-source.interface';

// PNG 1x1 transparente, para ejercitar la descarga de media sin depender
// de una URL externa (Node fetch resuelve data: URIs).
const SAMPLE_PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * Fuente de LinkedIn para desarrollo/tests: devuelve posteos fijos, sin llamar
 * a ninguna API. Es la implementación por defecto (LINKEDIN_FETCH_MODE=stub),
 * para poder probar toda la curaduría (sync, cola, aprobar, rechazar, dedupe)
 * antes de tener el acceso real aprobado por LinkedIn.
 */
export class LinkedInStubSource implements LinkedInSource {
    private readonly logger = new Logger(LinkedInStubSource.name);

    fetchRecentPosts(): Promise<FetchedLinkedInPost[]> {
        this.logger.warn(
            'Usando el stub de LinkedIn (LINKEDIN_FETCH_MODE=stub): posteos de ejemplo, no reales.',
        );
        return Promise.resolve([
            {
                externalId: 'urn:li:share:stub-1',
                url: 'https://www.linkedin.com/feed/update/urn:li:share:stub-1',
                text: 'Petrogas S.A. participó en la jornada de seguridad e higiene en Comodoro Rivadavia. Orgullosos de nuestro equipo.',
                mediaUrl: SAMPLE_PNG_DATA_URL,
                authorName: 'Petrogas S.A.',
                postedAt: new Date('2026-07-20T13:00:00.000Z'),
            },
            {
                externalId: 'urn:li:share:stub-2',
                url: 'https://www.linkedin.com/feed/update/urn:li:share:stub-2',
                text: 'Nueva búsqueda laboral: incorporamos operadores de planta. Enviá tu CV desde nuestra web.',
                mediaUrl: null,
                authorName: 'Petrogas S.A.',
                postedAt: new Date('2026-07-18T09:30:00.000Z'),
            },
        ]);
    }
}
