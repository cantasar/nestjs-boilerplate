interface KeySpec {
  key: string;
  keyFn?: (args: unknown[]) => string;
}

/**
 * Build the Redis cache key for a decorated handler.
 * - explicit `keyFn` → `<key>:<keyFn(args)>`
 * - no `keyFn`       → bare `<key>`
 *
 * The interceptor refuses to cache an arg-taking handler without a `keyFn`, so
 * args are never auto-serialized here — that avoided stringifying whole `@Req`
 * objects (circular → crash) and collapsing different args onto one key
 * (cross-request data leak).
 */
export function buildCacheKey(spec: KeySpec, args: unknown[]): string {
  return spec.keyFn ? `${spec.key}:${spec.keyFn(args)}` : spec.key;
}
