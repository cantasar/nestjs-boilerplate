import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { auditContextStorage, AuditContext } from './audit-context';

type AuthenticatedRequest = Request & {
  id?: string | number;
  user?: { id?: number };
};

/**
 * Establishes the per-request audit context (actor, request id, timestamp) in
 * AsyncLocalStorage so downstream handlers and the AuditInterceptor can read it
 * without threading it through call signatures.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ctx: AuditContext = {
      actorId: req.user?.id,
      requestId: req.id !== undefined ? String(req.id).slice(0, 64) : undefined,
      at: new Date(),
    };
    return new Observable((subscriber) => {
      auditContextStorage.run(ctx, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
