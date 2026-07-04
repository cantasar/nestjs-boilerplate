import 'reflect-metadata';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { CacheInterceptor } from './cache.interceptor';
import { CACHEABLE_METADATA } from '../decorators/cacheable.decorator';
import { CACHE_EVICT_METADATA } from '../decorators/cache-evict.decorator';
import type {
  CacheKeyRequest,
  CacheableOptions,
} from '../interfaces/cacheable-options.interface';
import type { CacheEvictOptions } from '../interfaces/cache-evict-options.interface';
import type { RedisService } from '../../redis/redis.service';
import { isPaginated } from '../types/paginated.type';
import { paginate } from '../utils/pagination.util';
import { AppModule } from '../../../../app.module';
import { AuditInterceptor } from '../audit/audit.interceptor';

interface RedisMock {
  get: jest.Mock<Promise<string | null>, [string]>;
  setWithExpirySeconds: jest.Mock<Promise<void>, [string, string, number]>;
  del: jest.Mock<Promise<number>, [string]>;
}

function makeRedis(getValue: string | null = null): RedisMock {
  return {
    get: jest.fn().mockResolvedValue(getValue),
    setWithExpirySeconds: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(1),
  };
}

function makeReflector(
  cacheable?: CacheableOptions,
  evict?: CacheEvictOptions,
): Reflector {
  return {
    get: (key: string) =>
      key === CACHEABLE_METADATA
        ? cacheable
        : key === CACHE_EVICT_METADATA
          ? evict
          : undefined,
  } as unknown as Reflector;
}

interface MockRequest {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  user?: { id?: number | string };
}

// Route handlers of the two declared arities the interceptor distinguishes.
const noArgHandler = (): void => {};
const argHandler = (_dto: unknown): void => {
  void _dto;
};

/**
 * Real HTTP ExecutionContext shape: `getArgs()` returns the PLATFORM args
 * `[req, res, next]` (never the handler's decorated parameters), the request
 * comes from `switchToHttp().getRequest()`, and `getHandler()` returns the
 * route handler function (whose `.length` is its declared arity).
 */
function makeCtx(
  handler: (...args: unknown[]) => void,
  req: MockRequest = {},
): ExecutionContext {
  const res = {};
  const nextFn = (): void => {};
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => ({}),
    getArgs: () => [req, res, nextFn],
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeNext(value: unknown): { next: CallHandler; calls: () => number } {
  const handle = jest.fn(() => of(value));
  return {
    next: { handle } as unknown as CallHandler,
    calls: () => handle.mock.calls.length,
  };
}

function envelope(value: unknown, paginated = false): string {
  return JSON.stringify({ __cached: 1, paginated, value });
}

const pageKeyFn = (req: CacheKeyRequest): string => String(req.query.page);

describe('CacheInterceptor', () => {
  it('miss: runs the handler and writes the enveloped result under the keyFn key', async () => {
    const redis = makeRedis(null);
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'u:list', ttl: 30, keyFn: pageKeyFn }),
      redis as unknown as RedisService,
    );
    const { next, calls } = makeNext({ id: 1 });

    const out = await lastValueFrom(
      interceptor.intercept(
        makeCtx(argHandler, { query: { page: '1' } }),
        next,
      ),
    );

    expect(out).toEqual({ id: 1 });
    expect(calls()).toBe(1);
    expect(redis.setWithExpirySeconds).toHaveBeenCalledWith(
      'u:list:1',
      envelope({ id: 1 }),
      30,
    );
  });

  it('hit: serves the cached value without calling the handler', async () => {
    const redis = makeRedis(envelope({ id: 99 }));
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'u:list', ttl: 30, keyFn: pageKeyFn }),
      redis as unknown as RedisService,
    );
    const { next, calls } = makeNext({ id: 1 });

    const out = await lastValueFrom(
      interceptor.intercept(
        makeCtx(argHandler, { query: { page: '1' } }),
        next,
      ),
    );

    expect(out).toEqual({ id: 99 });
    expect(calls()).toBe(0);
  });

  it('keyFn receives the request view; distinct users/params produce distinct keys', async () => {
    const redis = makeRedis(null);
    const seen: CacheKeyRequest[] = [];
    const keyFn = (req: CacheKeyRequest): string => {
      seen.push(req);
      return `${req.user?.id}:${req.params.id}:${req.query.page}`;
    };
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'u:list', ttl: 30, keyFn }),
      redis as unknown as RedisService,
    );

    const reqA: MockRequest = {
      params: { id: '5' },
      query: { page: '2' },
      user: { id: 7 },
    };
    const reqB: MockRequest = {
      params: { id: '5' },
      query: { page: '2' },
      user: { id: 8 },
    };
    await lastValueFrom(
      interceptor.intercept(makeCtx(argHandler, reqA), makeNext({ n: 1 }).next),
    );
    await lastValueFrom(
      interceptor.intercept(makeCtx(argHandler, reqB), makeNext({ n: 2 }).next),
    );

    expect(seen[0]).toEqual({
      params: { id: '5' },
      query: { page: '2' },
      user: { id: 7 },
    });
    const keys = redis.setWithExpirySeconds.mock.calls.map((c) => c[0]);
    expect(keys).toEqual(['u:list:7:5:2', 'u:list:8:5:2']);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('handler with declared parameters and no keyFn: not cached, warns', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const redis = makeRedis(null);
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'u:list', ttl: 30 }),
      redis as unknown as RedisService,
    );
    const { next, calls } = makeNext({ id: 1 });

    const out = await lastValueFrom(
      interceptor.intercept(
        makeCtx(argHandler, { query: { page: '1' } }),
        next,
      ),
    );

    expect(out).toEqual({ id: 1 });
    expect(calls()).toBe(1);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.setWithExpirySeconds).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no keyFn'));
    warn.mockRestore();
  });

  it('parameterless handler without keyFn caches under the bare key', async () => {
    const redis = makeRedis(null);
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'settings', ttl: 60 }),
      redis as unknown as RedisService,
    );
    const { next, calls } = makeNext({ theme: 'dark' });

    const out = await lastValueFrom(
      interceptor.intercept(makeCtx(noArgHandler), next),
    );

    expect(out).toEqual({ theme: 'dark' });
    expect(calls()).toBe(1);
    expect(redis.get).toHaveBeenCalledWith('settings');
    expect(redis.setWithExpirySeconds).toHaveBeenCalledWith(
      'settings',
      envelope({ theme: 'dark' }),
      60,
    );
  });

  it('paginated result keeps its marker (and envelope shape) across a round-trip', async () => {
    const page = paginate([{ id: 1 }, { id: 2 }], 5, 1, 2);
    const redis = makeRedis(null);
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'u:list', ttl: 30 }),
      redis as unknown as RedisService,
    );

    await lastValueFrom(
      interceptor.intercept(makeCtx(noArgHandler), makeNext(page).next),
    );
    const [, stored = ''] = redis.setWithExpirySeconds.mock.calls[0] ?? [];
    expect(JSON.parse(stored)).toMatchObject({ __cached: 1, paginated: true });

    // A later request hits the entry written above: the marker must be back so
    // ResponseTransformInterceptor unwraps the hit exactly like the miss.
    const redisHit = makeRedis(stored);
    const interceptor2 = new CacheInterceptor(
      makeReflector({ key: 'u:list', ttl: 30 }),
      redisHit as unknown as RedisService,
    );
    const { next, calls } = makeNext(page);
    const out = await lastValueFrom(
      interceptor2.intercept(makeCtx(noArgHandler), next),
    );

    expect(calls()).toBe(0);
    expect(isPaginated(out)).toBe(true);
    expect(out).toMatchObject({
      data: [{ id: 1 }, { id: 2 }],
      meta: page.meta,
    });
  });

  it('legacy cache entry (no envelope) is treated as a miss', async () => {
    const redis = makeRedis(JSON.stringify({ id: 99 }));
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'settings', ttl: 60 }),
      redis as unknown as RedisService,
    );
    const { next, calls } = makeNext({ id: 1 });

    const out = await lastValueFrom(
      interceptor.intercept(makeCtx(noArgHandler), next),
    );

    expect(out).toEqual({ id: 1 });
    expect(calls()).toBe(1);
    // The fresh result overwrites the legacy entry with the new shape.
    expect(redis.setWithExpirySeconds).toHaveBeenCalledWith(
      'settings',
      envelope({ id: 1 }),
      60,
    );
  });

  it('does not cache an undefined result', async () => {
    const redis = makeRedis(null);
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'settings', ttl: 60 }),
      redis as unknown as RedisService,
    );
    const { next } = makeNext(undefined);

    await lastValueFrom(interceptor.intercept(makeCtx(noArgHandler), next));

    expect(redis.setWithExpirySeconds).not.toHaveBeenCalled();
  });

  it('evict: deletes the bare key after the handler succeeds', async () => {
    const redis = makeRedis();
    const interceptor = new CacheInterceptor(
      makeReflector(undefined, { key: 'u:list' }),
      redis as unknown as RedisService,
    );
    const { next } = makeNext({ ok: true });

    await lastValueFrom(interceptor.intercept(makeCtx(noArgHandler), next));

    expect(redis.del).toHaveBeenCalledWith('u:list');
  });

  it('evict: keyFn receives the same request view as @Cacheable', async () => {
    const redis = makeRedis();
    const interceptor = new CacheInterceptor(
      makeReflector(undefined, {
        key: 'u:list',
        keyFn: (req) => `${req.user?.id}:${req.params.id}`,
      }),
      redis as unknown as RedisService,
    );
    const { next } = makeNext({ ok: true });

    await lastValueFrom(
      interceptor.intercept(
        makeCtx(argHandler, { params: { id: '5' }, user: { id: 7 } }),
        next,
      ),
    );

    expect(redis.del).toHaveBeenCalledWith('u:list:7:5');
  });

  // Cache must be the INNERMOST interceptor (registered last) so it caches the
  // raw domain result, after the audit interceptors observe it.
  it('is registered after the audit interceptor in AppModule', () => {
    const providers = Reflect.getMetadata('providers', AppModule) as Array<{
      provide?: unknown;
      useClass?: unknown;
      useExisting?: unknown;
    }>;
    const interceptors = providers
      .filter((p) => p && p.provide === APP_INTERCEPTOR)
      .map((p) => p.useClass ?? p.useExisting);
    const idxCache = interceptors.indexOf(CacheInterceptor);
    const idxAudit = interceptors.indexOf(AuditInterceptor);
    expect(idxCache).toBeGreaterThanOrEqual(0);
    expect(idxCache).toBeGreaterThan(idxAudit);
  });
});
