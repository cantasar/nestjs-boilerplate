import { auditLogs } from '../schema/audit-log.schema';

export type NewAuditLog = typeof auditLogs.$inferInsert;
