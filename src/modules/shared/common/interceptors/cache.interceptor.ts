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
import { buildCacheKey } from '../utils/cache-key.util';

type CacheRead = { hit: true; value: unknown } | { hit: false };

/**
 * Redis-backed read-through cache for handlers marked with `@Cacheable`,
 * plus invalidation for handlers marked with `@CacheEvict`. Caches the RAW
 * handler result (before ResponseTransformInterceptor envelopes it) so a hit
 * re-wraps identically. All Redis calls degrade gracefully — a cache failure
 * never 500s the underlying request.
 *
 * Limitations (by design):
 * - An arg-taking handler MUST supply `keyFn`; otherwise caching is skipped (a
 *   single bare key for all args would serve one caller's data to another).
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
    const args = context.getArgs<unknown[]>();
    if (!opts.keyFn && args.length > 0) {
      this.logger.warn(
        `@Cacheable('${opts.key}') skipped: handler takes args but no keyFn ` +
          `provided — caching under a single key would leak data across calls.`,
      );
      return next.handle();
    }
    const key = buildCacheKey(opts, args);

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
    const args = context.getArgs<unknown[]>();
    const key = buildCacheKey(opts, args);
    return next.handle().pipe(tap(() => void this.evict(key)));
  }

  private async readCache(key: string): Promise<CacheRead> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) {
        return { hit: false };
      }
      const value: unknown = JSON.parse(raw);
      return { hit: true, value };
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
    try {
      await this.redis.setWithExpirySeconds(key, JSON.stringify(result), ttl);
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

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
