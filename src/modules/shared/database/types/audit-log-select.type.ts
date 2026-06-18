import { auditLogs } from '../schema/audit-log.schema';

export type AuditLog = typeof auditLogs.$inferSelect;
