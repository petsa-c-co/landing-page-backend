import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    FetchedLinkedInPost,
    LinkedInSource,
} from './linkedin-source.interface';

// Formato (parcial) de la respuesta de la Posts API de LinkedIn. Solo se
// tipifican los campos que consumimos; el resto se ignora.
interface RawLinkedInPost {
    id?: string;
    commentary?: string;
    createdAt?: number;
    content?: {
        media?: { id?: string; altText?: string };
    };
}
interface RawPostsResponse {
    elements?: RawLinkedInPost[];
}
interface RawImage {
    downloadUrl?: string;
}

/**
 * Implementación real: lee los posteos de la página de empresa vía la
 * Community Management API de LinkedIn (endpoint /rest/posts, finder q=author).
 *
 * IMPORTANTE: requiere que LinkedIn haya aprobado el acceso a ese producto y un
 * access token válido (variables LINKEDIN_*). Sin credenciales lanza un error
 * claro y NO rompe el arranque de la app (la fuente se instancia igual; el
 * error surge recién al intentar sincronizar).
 *
 * El formato de `content` y la resolución de imágenes puede variar según la
 * versión de la API; ese mapeo es best-effort y conviene reajustarlo cuando se
 * disponga del acceso real para probarlo end-to-end.
 */
export class LinkedInApiSource implements LinkedInSource {
    private readonly logger = new Logger(LinkedInApiSource.name);

    constructor(private readonly config: ConfigService) {}

    async fetchRecentPosts(): Promise<FetchedLinkedInPost[]> {
        const token = this.config.get<string>('LINKEDIN_ACCESS_TOKEN');
        const orgUrn = this.config.get<string>('LINKEDIN_ORGANIZATION_URN');
        if (!token || !orgUrn) {
            throw new ServiceUnavailableException(
                'La integración con LinkedIn no está configurada (faltan LINKEDIN_ACCESS_TOKEN y/o LINKEDIN_ORGANIZATION_URN).',
            );
        }

        const url =
            `${this.baseUrl()}/rest/posts` +
            `?q=author&author=${encodeURIComponent(orgUrn)}&count=25&sortBy=CREATED`;

        const res = await fetch(url, { headers: this.headers(token) });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            this.logger.error(
                `LinkedIn /rest/posts respondió ${res.status}: ${body.slice(0, 500)}`,
            );
            throw new ServiceUnavailableException(
                `LinkedIn no respondió correctamente (HTTP ${res.status}). Revisá el token y el acceso a la API.`,
            );
        }

        const data = (await res.json()) as RawPostsResponse;
        const elements = data.elements ?? [];

        const posts: FetchedLinkedInPost[] = [];
        for (const el of elements) {
            if (!el.id) {
                continue;
            }
            posts.push({
                externalId: el.id,
                url: `https://www.linkedin.com/feed/update/${el.id}`,
                text: el.commentary ?? '',
                mediaUrl: await this.resolveMediaUrl(el, token),
                authorName: null,
                postedAt: el.createdAt ? new Date(el.createdAt) : null,
            });
        }
        return posts;
    }

    private baseUrl(): string {
        return (
            this.config.get<string>('LINKEDIN_API_BASE_URL') ??
            'https://api.linkedin.com'
        ).replace(/\/+$/, '');
    }

    private headers(token: string): Record<string, string> {
        return {
            Authorization: `Bearer ${token}`,
            'LinkedIn-Version':
                this.config.get<string>('LINKEDIN_API_VERSION') ?? '202401',
            'X-Restli-Protocol-Version': '2.0.0',
        };
    }

    /**
     * Resuelve la URL descargable de la imagen de un post. La Posts API entrega
     * un URN de imagen; hay que pedir /rest/images/{urn} para obtener la URL.
     * Best-effort: cualquier fallo devuelve null (el post se importa sin
     * portada y admin puede agregarla a mano).
     */
    private async resolveMediaUrl(
        el: RawLinkedInPost,
        token: string,
    ): Promise<string | null> {
        const imageUrn = el.content?.media?.id;
        if (!imageUrn?.startsWith('urn:li:image:')) {
            return null;
        }
        try {
            const res = await fetch(
                `${this.baseUrl()}/rest/images/${encodeURIComponent(imageUrn)}`,
                { headers: this.headers(token) },
            );
            if (!res.ok) {
                return null;
            }
            const image = (await res.json()) as RawImage;
            return image.downloadUrl ?? null;
        } catch {
            this.logger.warn(`No se pudo resolver la imagen ${imageUrn}`);
            return null;
        }
    }
}
