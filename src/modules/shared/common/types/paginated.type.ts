import type { PaginationMetaDto } from '../dto/pagination-meta.dto';

/**
 * Marks a value as a paginated result. The interceptor checks this symbol, not
 * `data`/`meta` keys, so a plain object with those keys isn't mistaken for one.
 */
export const PAGINATED_MARKER = Symbol('paginated');

/** A paginated list result; build it with `paginate()` so the marker is set. */
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
