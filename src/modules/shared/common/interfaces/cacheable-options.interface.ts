/**
 * Narrow view of the incoming HTTP request handed to a cache `keyFn`. The
 * interceptor extracts it via `context.switchToHttp().getRequest()` — it never
 * sees the handler's decorated parameters (an HTTP ExecutionContext's
 * `getArgs()` only exposes the platform args `[req, res, next]`).
 */
export interface CacheKeyRequest {
  /** Route params, e.g. `{ id: '42' }` for `GET /users/:id`. */
  params: Record<string, string>;
  /** Parsed query string, e.g. `{ page: '2' }`. */
  query: Record<string, unknown>;
  /** Authenticated principal attached by the auth guard, when present. */
  user?: { id?: number | string };
}

export interface CacheableOptions {
  /** Required key prefix, e.g. 'users:list'. */
  key: string;
  /** Time-to-live in seconds. */
  ttl: number;
  /**
   * Builds the key suffix from the incoming HTTP request (params/query/user),
   * e.g. `@Cacheable({ key: 'users:list', ttl: 30, keyFn: (req) => `${req.query.page}` })`.
   * Required for handlers that declare parameters — without it such a handler
   * is not cached (a single bare key would serve one caller's data to another).
   * Omit only for parameterless handlers, which cache under the bare `key`.
   */
  keyFn?: (req: CacheKeyRequest) => string;
}
