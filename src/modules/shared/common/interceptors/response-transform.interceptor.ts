import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';
import { isPaginated } from '../types/paginated.type';
import type { SuccessEnvelope } from '../types/response-envelope.type';

/**
 * Wraps every successful response in the v1 envelope. Rules:
 *  - `@RawResponse()` handlers are returned verbatim (no envelope).
 *  - A `Paginated<T>` result is unwrapped to `{ success, data, meta }`.
 *  - `undefined` / `null` (incl. 204 handlers) → `{ success: true, data: null }`.
 *  - Everything else → `{ success: true, data }`.
 *
 * Payload SHAPE is never mutated here: presentation transforms (e.g. Date →
 * Unix seconds, dropping nulls) belong in the feature's mapper so the DTO type
 * and the wire format stay in agreement. The error envelope is the filter's
 * job; this interceptor only ever runs on the success path.
 */
@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope<unknown> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope<unknown> | T> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((result) => {
        if (isRaw) return result;
        if (isPaginated(result)) {
          return { success: true, data: result.data, meta: result.meta };
        }
        return { success: true, data: result ?? null };
      }),
    );
  }
}
