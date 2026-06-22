export interface CacheableOptions<
  TArgs extends readonly unknown[] = unknown[],
> {
  /** Required key prefix, e.g. 'users:list'. */
  key: string;
  /** Time-to-live in seconds. */
  ttl: number;
  /**
   * Builds the key suffix from the handler args, typed against its argument
   * tuple, e.g. `@Cacheable<[PaginationDto]>({ keyFn: ([dto]) => `${dto.page}` })`.
   * Required for arg-taking handlers — without it an arg handler is not cached
   * (a single bare key would serve one caller's data to another). Omit only for
   * no-arg handlers, which cache under the bare `key`.
   */
  keyFn?: (args: TArgs) => string;
}
