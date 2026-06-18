import { SetMetadata } from '@nestjs/common';
import { AUDIT_METADATA } from './constants/audit.tokens';
import type { AuditOptions } from './interfaces/audit-options.types';

/**
 * Mark a mutating handler for auditing. The AuditInterceptor reads this metadata
 * to capture a before/after snapshot and hand an AuditEntry to the AuditSink.
 */
export const Audit = (opts: AuditOptions): MethodDecorator =>
  SetMetadata(AUDIT_METADATA, opts);
