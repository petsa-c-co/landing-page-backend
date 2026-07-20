import {
    PaginatedResult,
    PaginationMeta,
} from '../interfaces/paginated-result.interface';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

interface PaginationInput {
    page?: number;
    limit?: number;
}

/**
 * Arma un PaginatedResult a partir de los items de la página actual y el total
 * de registros. Las URLs (nextPageUrl/prevPageUrl) las completa el interceptor,
 * que es quien conoce el path del request; aquí quedan en null.
 */
export function paginate<T>(
    items: T[],
    totalItems: number,
    { page, limit }: PaginationInput,
): PaginatedResult<T> {
    const itemsPerPage = limit && limit > 0 ? limit : DEFAULT_LIMIT;
    const currentPage = page && page > 0 ? page : DEFAULT_PAGE;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    const meta: PaginationMeta = {
        totalItems,
        itemsPerPage,
        currentPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        nextPageUrl: null,
        prevPageUrl: null,
    };

    return new PaginatedResult(items, meta);
}

/**
 * Construye la URL de una página preservando el resto de los query params
 * (filtros, orden, etc.) y sobrescribiendo únicamente `page`. Los valores no
 * primitivos (objetos anidados tipo ParsedQs) se omiten de la URL.
 */
export function buildPageUrl(
    path: string,
    query: Record<string, unknown>,
    page: number,
): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (key === 'page' || value === undefined || value === null) {
            continue;
        }
        if (Array.isArray(value)) {
            value.forEach((v) => appendPrimitive(params, key, v));
        } else {
            appendPrimitive(params, key, value);
        }
    }
    params.set('page', String(page));
    return `${path}?${params.toString()}`;
}

function appendPrimitive(
    params: URLSearchParams,
    key: string,
    value: unknown,
): void {
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        params.append(key, String(value));
    }
}
