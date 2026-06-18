/**
 * DI token for the AuditSink port. Provide a concrete implementation
 * (DrizzleAuditSink by default) against this token in AuditModule.
 */
export const AUDIT_SINK = Symbol('AUDIT_SINK');

/** Reflector metadata key carrying the @Audit options on a handler. */
export const AUDIT_METADATA = 'audit:options';
