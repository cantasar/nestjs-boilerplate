import type { CacheKeyRequest } from '../interfaces/cacheable-options.interface';

interface KeySpec {
  key: string;
  keyFn?: (req: CacheKeyRequest) => string;
}

/**
 * Build the Redis cache key for a decorated handler.
 * - explicit `keyFn` → `<key>:<keyFn(req)>`
 * - no `keyFn`       → bare `<key>`
 *
 * `keyFn` receives a narrow view of the HTTP request (params/query/user) —
 * never the handler's decorated parameters, which an ExecutionContext does not
 * expose. The interceptor refuses to cache a parameter-taking handler without
 * a `keyFn`, so the request is never auto-serialized here — that avoids
 * stringifying whole request objects (circular → crash) and collapsing
 * different callers onto one key (cross-request data leak).
 */
export function buildCacheKey(spec: KeySpec, req: CacheKeyRequest): string {
  return spec.keyFn ? `${spec.key}:${spec.keyFn(req)}` : spec.key;
}
