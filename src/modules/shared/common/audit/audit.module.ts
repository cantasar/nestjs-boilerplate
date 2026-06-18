import { Global, Module } from '@nestjs/common';
import { AUDIT_SINK } from './constants/audit.tokens';
import { DrizzleAuditSink } from './sinks/drizzle-audit.sink';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { AuditInterceptor } from './audit.interceptor';

/**
 * Cross-cutting audit infrastructure. @Global so any module can rely on the
 * audit context and @Audit decorator without importing this module. Binds the
 * AuditSink port to the reference DrizzleAuditSink (swap by re-providing
 * AUDIT_SINK) and exports both interceptors for APP_INTERCEPTOR wiring in
 * app.module.
 */
@Global()
@Module({
  providers: [
    { provide: AUDIT_SINK, useClass: DrizzleAuditSink },
    AuditContextInterceptor,
    AuditInterceptor,
  ],
  exports: [AUDIT_SINK, AuditContextInterceptor, AuditInterceptor],
})
export class AuditModule {}
