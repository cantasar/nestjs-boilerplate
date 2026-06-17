import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Observable, from } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import { getAuditContext } from './audit-context';
import { AUDIT_METADATA, AUDIT_SINK } from './constants/audit.tokens';
import type { AuditOptions } from './interfaces/audit-options.types';
import type { AuditSink } from './interfaces/audit-sink.interface';
import type { AuditEntry } from './interfaces/audit-entry.types';

/**
 * Captures a before/after snapshot around any @Audit-marked handler and hands
 * the resulting AuditEntry to the AuditSink. Registered INSIDE the response
 * envelope interceptor, so it observes the raw handler result (the domain
 * object/DTO), not the `{ success, data }` wrapper.
 *
 * Auditing is best-effort: a failing snapshot loader or sink must never turn a
 * successful business request into a 500.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    @Inject(AUDIT_SINK) private readonly sink: AuditSink,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opts = this.reflector.get<AuditOptions | undefined>(
      AUDIT_METADATA,
      context.getHandler(),
    );
    if (!opts || context.getType() !== 'http') {
      return next.handle();
    }
    const args = context.getArgs();
    // Resolve the controller INSTANCE (singleton) so a loadBefore that calls
    // `handlerThis.service.*` works. context.getClass() is the class (no
    // injected deps); fall back to it for request-scoped/unresolvable
    // controllers.
    let handlerThis: unknown;
    try {
      handlerThis = this.moduleRef.get(context.getClass(), { strict: false });
    } catch {
      handlerThis = context.getClass();
    }

    // Defer + catch so a failing loadBefore (sync throw included) degrades to a
    // null before-snapshot — auditing must never 500 the underlying request.
    const beforePromise = opts.loadBefore
      ? Promise.resolve()
          .then(() => opts.loadBefore!(args, handlerThis))
          .catch((err) => {
            this.logger.warn(
              `audit loadBefore failed (${opts.entity}.${opts.action}): ` +
                (err instanceof Error ? err.message : String(err)),
            );
            return null;
          })
      : Promise.resolve(null);

    return from(beforePromise).pipe(
      mergeMap((before) =>
        next.handle().pipe(
          tap((result) => {
            if (opts.skipIf?.(args, result)) return;
            this.writeLog(opts, args, before, result);
          }),
        ),
      ),
    );
  }

  private writeLog(
    opts: AuditOptions,
    args: unknown[],
    before: unknown,
    result: unknown,
  ): void {
    const ctx = getAuditContext();
    const after = opts.loadAfter ? opts.loadAfter(args, result) : result;
    const rawId = opts.entityId
      ? opts.entityId(args, result)
      : extractId(result);
    if (rawId === null || rawId === undefined) {
      this.logger.debug(
        `Skipping audit log for ${opts.entity}.${opts.action} — no entityId resolved`,
      );
      return;
    }
    const entry: AuditEntry = {
      entity: opts.entity,
      action: opts.action,
      entityId: String(rawId),
      before: toRecord(before),
      after: toRecord(after),
      actorId: ctx?.actorId,
      requestId: ctx?.requestId,
      at: ctx?.at ?? new Date(),
    };
    // Out-of-band: never await/propagate into the request lifecycle.
    void this.sink.logChange(entry).catch((err) => {
      this.logger.error(
        `audit sink failed (${opts.entity}.${opts.action}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    });
  }
}

function extractId(value: unknown): string | number | null {
  if (value === null || typeof value !== 'object') return null;
  const id = (value as { id?: unknown }).id;
  if (typeof id === 'string' || typeof id === 'number') return id;
  return null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') return value as Record<string, unknown>;
  return { value };
}
