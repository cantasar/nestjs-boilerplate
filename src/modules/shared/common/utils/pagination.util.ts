import type { PaginationMetaDto } from '../dto/pagination-meta.dto';
import { PAGINATED_MARKER, type Paginated } from '../types/paginated.type';

/** Builds the envelope's `meta` from the total count, page and limit. */
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

/** Wraps a page of rows into a `Paginated<T>` for paginated list endpoints. */
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
