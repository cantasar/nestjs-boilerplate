import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import { RedisService } from '../../redis/redis.service';
import { CACHEABLE_METADATA } from '../decorators/cacheable.decorator';
import { CACHE_EVICT_METADATA } from '../decorators/cache-evict.decorator';
import { CacheableOptions } from '../interfaces/cacheable-options.interface';
import { CacheEvictOptions } from '../interfaces/cache-evict-options.interface';
import type { CacheKeyRequest } from '../interfaces/cacheable-options.interface';
import { PAGINATED_MARKER, isPaginated } from '../types/paginated.type';
import { buildCacheKey } from '../utils/cache-key.util';

type CacheRead = { hit: true; value: unknown } | { hit: false };

/**
 * Shape persisted in Redis. Wrapping the raw handler result lets a hit restore
 * what JSON serialization loses — the `Paginated` symbol marker — and lets
 * reads reject entries written before this envelope existed (treated as a
 * miss; they expire naturally).
 */
type CachedEnvelope = { __cached: 1; paginated: boolean; value: unknown };

/**
 * Redis-backed read-through cache for handlers marked with `@Cacheable`,
 * plus invalidation for handlers marked with `@CacheEvict`. Caches the RAW
 * handler result (before ResponseTransformInterceptor envelopes it) inside a
 * small wrapper that records whether it was paginated, so a hit re-wraps
 * identically to the miss. All Redis calls degrade gracefully — a cache
 * failure never 500s the underlying request.
 *
 * `keyFn` receives a narrow view of the HTTP request (params/query/user),
 * extracted via `switchToHttp().getRequest()` — NOT the handler's decorated
 * parameters. An HTTP ExecutionContext's `getArgs()` only exposes the platform
 * args `[req, res, next]`; the route handler's own parameters are never
 * available to an interceptor.
 *
 * Limitations (by design):
 * - A handler that declares parameters MUST supply `keyFn`; otherwise caching
 *   is skipped (a single bare key for all callers would serve one caller's
 *   data to another). Parameterless handlers cache under the bare `key`.
 * - The cached value is JSON round-tripped: handlers must return JSON-safe DTOs
 *   (no `Date`/class-instance/`instanceof` dependence on the hit path).
 * - `@CacheEvict` deletes ONE exact key (same `key`+`keyFn`); it cannot wildcard
 *   a whole prefix. Evict each variant you cached, or cache under a single key.
 * - No stampede protection: concurrent misses each run the handler. Acceptable
 *   for cheap handlers; gate hot/expensive ones yourself (`redis.acquireLock`).
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const cacheable = this.reflector.get<CacheableOptions | undefined>(
      CACHEABLE_METADATA,
      context.getHandler(),
    );
    if (cacheable) {
      return this.handleCacheable(cacheable, context, next);
    }

    const evict = this.reflector.get<CacheEvictOptions | undefined>(
      CACHE_EVICT_METADATA,
      context.getHandler(),
    );
    if (evict) {
      return this.handleEvict(evict, context, next);
    }

    return next.handle();
  }

  private handleCacheable(
    opts: CacheableOptions,
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    // Declared arity of the route handler — the only reliable signal that it
    // takes parameters (getArgs() would return [req, res, next], never them).
    if (!opts.keyFn && context.getHandler().length > 0) {
      this.logger.warn(
        `@Cacheable('${opts.key}') skipped: handler declares parameters but ` +
          `no keyFn provided — caching under a single key would leak data ` +
          `across calls.`,
      );
      return next.handle();
    }
    const key = buildCacheKey(opts, this.keyRequest(context));

    return from(this.readCache(key)).pipe(
      mergeMap((read) => {
        if (read.hit) {
          return of(read.value);
        }
        return next
          .handle()
          .pipe(tap((result) => void this.writeCache(key, result, opts.ttl)));
      }),
    );
  }

  private handleEvict(
    opts: CacheEvictOptions,
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const key = buildCacheKey(opts, this.keyRequest(context));
    return next.handle().pipe(tap(() => void this.evict(key)));
  }

  /**
   * Narrow the platform request down to the shape `keyFn` is typed against.
   */
  private keyRequest(context: ExecutionContext): CacheKeyRequest {
    const req = context.switchToHttp().getRequest<{
      params?: Record<string, string>;
      query?: Record<string, unknown>;
      user?: { id?: number | string };
    }>();
    return { params: req.params ?? {}, query: req.query ?? {}, user: req.user };
  }

  private async readCache(key: string): Promise<CacheRead> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) {
        return { hit: false };
      }
      // boundary: validated — narrowed by isCachedEnvelope below.
      const parsed: unknown = JSON.parse(raw);
      if (!isCachedEnvelope(parsed)) {
        // Entry predates the envelope (or is foreign) — treat as a miss; the
        // fresh write replaces it and old entries expire naturally.
        return { hit: false };
      }
      if (parsed.paginated) {
        if (typeof parsed.value !== 'object' || parsed.value === null) {
          return { hit: false };
        }
        // JSON.stringify drops symbol keys on write; re-attach the marker so
        // ResponseTransformInterceptor unwraps the hit exactly like the miss.
        Object.defineProperty(parsed.value, PAGINATED_MARKER, { value: true });
      }
      return { hit: true, value: parsed.value };
    } catch (err) {
      this.logger.warn(`cache read failed (${key}): ${errMessage(err)}`);
      return { hit: false };
    }
  }

  private async writeCache(
    key: string,
    result: unknown,
    ttl: number,
  ): Promise<void> {
    // void-ok — fire-and-forget cache write (caller uses `void`).
    // JSON.stringify(undefined) is undefined → would store the literal
    // "undefined" and throw on every subsequent read. Skip.
    if (result === undefined) {
      return;
    }
    // The Paginated symbol marker does not survive JSON.stringify, so record
    // pagination explicitly; readCache re-attaches the marker on a hit.
    const envelope: CachedEnvelope = {
      __cached: 1,
      paginated: isPaginated(result),
      value: result,
    };
    try {
      await this.redis.setWithExpirySeconds(key, JSON.stringify(envelope), ttl);
    } catch (err) {
      this.logger.warn(`cache write failed (${key}): ${errMessage(err)}`);
    }
  }

  private async evict(key: string): Promise<void> {
    // void-ok — fire-and-forget cache eviction (caller uses `void`).
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`cache evict failed (${key}): ${errMessage(err)}`);
    }
  }
}

function isCachedEnvelope(value: unknown): value is CachedEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __cached?: unknown }).__cached === 1 &&
    typeof (value as { paginated?: unknown }).paginated === 'boolean' &&
    'value' in value
  );
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
