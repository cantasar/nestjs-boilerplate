import type { PaginationMetaDto } from '../dto/pagination-meta.dto';

/** The success envelope wrapping every (non-raw) 2xx JSON response. */
export interface SuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: PaginationMetaDto;
}
