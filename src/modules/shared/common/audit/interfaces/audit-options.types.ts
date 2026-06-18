import type { AuditAction } from '../enums/audit-action.enum';
import type { AuditEntity } from '../enums/audit-entity.enum';

/**
 * Options passed to @Audit. Callbacks receive the handler's resolved arguments
 * and (where relevant) its result, so the audited entityId and snapshots can be
 * derived from request params, the controller instance, or the response.
 */
export interface AuditOptions {
  entity: AuditEntity;
  action: AuditAction;
  /** Resolve the audited entity id; falls back to `result.id` when omitted. */
  entityId?: (
    args: unknown[],
    result: unknown,
  ) => string | number | null | undefined;
  /** Load the pre-mutation snapshot. `handlerThis` is the controller instance. */
  loadBefore?: (
    args: unknown[],
    handlerThis: unknown,
    // void-ok: snapshot shape is caller-defined and opaque to the framework
  ) => Promise<unknown> | unknown;
  /** Derive the post-mutation snapshot; defaults to the raw handler result. */
  loadAfter?: (args: unknown[], result: unknown) => unknown;
  /** Skip writing an entry when this returns true (e.g. no-op updates). */
  skipIf?: (args: unknown[], result: unknown) => boolean;
}
