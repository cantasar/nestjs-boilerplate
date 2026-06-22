export interface CacheEvictOptions<
  TArgs extends readonly unknown[] = unknown[],
> {
  /** Key prefix to evict, e.g. 'users:list'. */
  key: string;
  /**
   * Optional suffix builder targeting a single cached entry, typed against the
   * decorated handler's argument tuple. Omit to evict the bare prefix key (the
   * no-arg `@Cacheable({ key })` entry).
   */
  keyFn?: (args: TArgs) => string;
}
