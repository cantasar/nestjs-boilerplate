import type { AuditEntry } from './audit-entry.types';

/**
 * Port for the audit write path. Implementations persist an AuditEntry however
 * they like (DB, log stream, external service). Injected behind the AUDIT_SINK
 * token so the interceptor never depends on a concrete sink.
 *
 * Implementations must be out of band: a logChange failure must NOT propagate
 * to the business request (swallow + log internally), and the write must not
 * join the business transaction (see CLAUDE.md / audit module docs).
 */
export interface AuditSink {
  // void-ok
  logChange(entry: AuditEntry): Promise<void>;
}
