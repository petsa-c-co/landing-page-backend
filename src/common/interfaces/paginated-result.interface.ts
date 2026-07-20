/**
 * Metadata de paginación que acompaña a una lista en el sobre de respuesta.
 * Las URLs las completa el ResponseInterceptor a partir del request.
 */
export interface PaginationMeta {
    totalItems: number;
    itemsPerPage: number;
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextPageUrl: string | null;
    prevPageUrl: string | null;
}

/**
 * Resultado paginado que debe devolver un handler para que el interceptor lo
 * exponga como { data: [...], meta: {...} }. Constrúyelo con paginate().
 */
export class PaginatedResult<T> {
    constructor(
        public readonly data: T[],
        public readonly meta: PaginationMeta,
    ) {}
}
