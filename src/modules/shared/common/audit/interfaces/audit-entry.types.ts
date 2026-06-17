import type { AuditAction } from '../enums/audit-action.enum';
import type { AuditEntity } from '../enums/audit-entity.enum';

/**
 * A single audited mutation, as handed to an AuditSink. `before`/`after` are
 * already-redacted snapshots; the interceptor builds this from the @Audit
 * metadata plus the per-request audit context.
 */
export interface AuditEntry {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  actorId?: number;
  requestId?: string;
  at: Date;
}
