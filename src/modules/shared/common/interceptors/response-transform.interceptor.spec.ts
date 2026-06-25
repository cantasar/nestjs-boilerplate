import 'reflect-metadata';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { ResponseTransformInterceptor } from './response-transform.interceptor';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

type FlagMap = Partial<Record<typeof RAW_RESPONSE_KEY, boolean>>;

function makeReflector(flags: FlagMap): Reflector {
  return {
    getAllAndOverride: (key: string) => flags[key as keyof FlagMap] ?? false,
  } as unknown as Reflector;
}

function makeContext(): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class C {},
  } as unknown as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

async function run<T>(flags: FlagMap, payload: T): Promise<unknown> {
  const interceptor = new ResponseTransformInterceptor<T>(makeReflector(flags));
  const observable = interceptor.intercept(makeContext(), makeHandler(payload));
  return lastValueFrom(observable);
}

describe('ResponseTransformInterceptor', () => {
  it('wraps a primitive payload in the success envelope', async () => {
    expect(await run({}, 'hello')).toEqual({ success: true, data: 'hello' });
  });

  it('returns null for undefined / 204 handlers', async () => {
    expect(await run({}, undefined)).toEqual({ success: true, data: null });
    expect(await run({}, null)).toEqual({ success: true, data: null });
  });

  it('passes through raw responses unchanged', async () => {
    const raw = { foo: 1 };
    expect(await run({ [RAW_RESPONSE_KEY]: true }, raw)).toBe(raw);
  });

  it('does not mutate payload shape (Dates and nulls pass through)', async () => {
    const now = new Date('2026-01-15T12:30:45.000Z');
    const result = (await run({}, { at: now, optional: null })) as {
      data: { at: Date; optional: null };
    };
    expect(result.data.at).toBe(now);
    expect(result.data.optional).toBeNull();
  });
});
