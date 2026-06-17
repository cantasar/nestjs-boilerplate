import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request audit context propagated via AsyncLocalStorage. Populated by
 * AuditContextInterceptor and read by AuditInterceptor when assembling an entry.
 */
export interface AuditContext {
  actorId?: number;
  requestId?: string;
  at: Date;
}

export const auditContextStorage = new AsyncLocalStorage<AuditContext>();

export function getAuditContext(): AuditContext | undefined {
  return auditContextStorage.getStore();
}
