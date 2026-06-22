import 'reflect-metadata';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { CacheInterceptor } from './cache.interceptor';
import { CACHEABLE_METADATA } from '../decorators/cacheable.decorator';
import { CACHE_EVICT_METADATA } from '../decorators/cache-evict.decorator';
import type { CacheableOptions } from '../interfaces/cacheable-options.interface';
import type { CacheEvictOptions } from '../interfaces/cache-evict-options.interface';
import type { RedisService } from '../../redis/redis.service';
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

function makeCtx(args: unknown[]): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => args,
  } as unknown as ExecutionContext;
}

function makeNext(value: unknown): { next: CallHandler; calls: () => number } {
  const handle = jest.fn(() => of(value));
  return {
    next: { handle } as unknown as CallHandler,
    calls: () => handle.mock.calls.length,
  };
}

const pageKeyFn = (args: unknown[]): string =>
  String((args[0] as { page: number }).page);

describe('CacheInterceptor', () => {
  it('miss: runs the handler and writes the raw result under the keyFn key', async () => {
    const redis = makeRedis(null);
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'u:list', ttl: 30, keyFn: pageKeyFn }),
      redis as unknown as RedisService,
    );
    const { next, calls } = makeNext({ id: 1 });

    const out = await lastValueFrom(
      interceptor.intercept(makeCtx([{ page: 1 }]), next),
    );

    expect(out).toEqual({ id: 1 });
    expect(calls()).toBe(1);
    expect(redis.setWithExpirySeconds).toHaveBeenCalledWith(
      'u:list:1',
      JSON.stringify({ id: 1 }),
      30,
    );
  });

  it('hit: serves the cached value without calling the handler', async () => {
    const redis = makeRedis(JSON.stringify({ id: 99 }));
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'u:list', ttl: 30, keyFn: pageKeyFn }),
      redis as unknown as RedisService,
    );
    const { next, calls } = makeNext({ id: 1 });

    const out = await lastValueFrom(
      interceptor.intercept(makeCtx([{ page: 1 }]), next),
    );

    expect(out).toEqual({ id: 99 });
    expect(calls()).toBe(0);
  });

  it('arg-taking handler without keyFn is NOT cached (passthrough)', async () => {
    const redis = makeRedis(null);
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'u:list', ttl: 30 }),
      redis as unknown as RedisService,
    );
    const { next, calls } = makeNext({ id: 1 });

    const out = await lastValueFrom(
      interceptor.intercept(makeCtx([{ page: 1 }]), next),
    );

    expect(out).toEqual({ id: 1 });
    expect(calls()).toBe(1);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('does not cache an undefined result', async () => {
    const redis = makeRedis(null);
    const interceptor = new CacheInterceptor(
      makeReflector({ key: 'settings', ttl: 60 }),
      redis as unknown as RedisService,
    );
    const { next } = makeNext(undefined);

    await lastValueFrom(interceptor.intercept(makeCtx([]), next));

    expect(redis.setWithExpirySeconds).not.toHaveBeenCalled();
  });

  it('evict: deletes the key after the handler succeeds', async () => {
    const redis = makeRedis();
    const interceptor = new CacheInterceptor(
      makeReflector(undefined, { key: 'u:list' }),
      redis as unknown as RedisService,
    );
    const { next } = makeNext({ ok: true });

    await lastValueFrom(interceptor.intercept(makeCtx([]), next));

    expect(redis.del).toHaveBeenCalledWith('u:list');
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
