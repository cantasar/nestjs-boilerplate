import type { PaginationMetaDto } from '../dto/pagination-meta.dto';
import { PAGINATED_MARKER, type Paginated } from '../types/paginated.type';

/**
 * Build the standard pagination meta from a total count and the current page /
 * limit. Single source for the envelope's `meta` shape.
 */
export function buildPaginationMeta(
  totalCount: number,
  page: number,
  limit: number,
): PaginationMetaDto {
  const totalPages = limit > 0 ? Math.ceil(totalCount / limit) : 0;
  return {
    page,
    limit,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Wrap a page of rows + its total into a `Paginated<T>` (marker attached) so the
 * response interceptor unwraps it into `{ success, data, meta }`. Services return
 * this from list endpoints.
 */
export function paginate<T>(
  data: T[],
  totalCount: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    [PAGINATED_MARKER]: true,
    data,
    meta: buildPaginationMeta(totalCount, page, limit),
  };
}
