import type { PaginationMetaDto } from '../dto/pagination-meta.dto';

/**
 * Symbol marking a value as a paginated result. The response interceptor checks
 * for it (rather than duck-typing `data`/`meta`) so an ordinary object that
 * happens to have those keys is never mistaken for a paginated payload.
 */
export const PAGINATED_MARKER = Symbol('paginated');

/**
 * A paginated list returned by a service/repository. The interceptor unwraps it
 * into the envelope as `{ success: true, data, meta }`. Build instances via
 * `paginate()` from `utils/pagination.util` so the marker is always attached.
 */
export interface Paginated<T> {
  readonly [PAGINATED_MARKER]: true;
  readonly data: T[];
  readonly meta: PaginationMetaDto;
}

export function isPaginated(value: unknown): value is Paginated<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [PAGINATED_MARKER]?: unknown })[PAGINATED_MARKER] === true
  );
}
