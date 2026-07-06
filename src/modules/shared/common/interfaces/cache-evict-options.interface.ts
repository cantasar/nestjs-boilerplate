import type { CacheKeyRequest } from './cacheable-options.interface';

export interface CacheEvictOptions {
  /** Key prefix to evict, e.g. 'users:list'. */
  key: string;
  /**
   * Optional suffix builder targeting a single cached entry, receiving the
   * same narrow HTTP-request view (params/query/user) as `@Cacheable`'s
   * `keyFn`. Omit to evict the bare prefix key (the parameterless
   * `@Cacheable({ key })` entry).
   */
  keyFn?: (req: CacheKeyRequest) => string;
}
