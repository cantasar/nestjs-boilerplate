import {
  pgTable,
  bigserial,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Reference audit-log table backing the DrizzleAuditSink. The sink writes one
 * row per audited mutation, out of band from the business transaction (see
 * audit module docs / CLAUDE.md). Columns mirror the AuditEntry shape; adapt the
 * enum-backed `action`/`entity` columns to your domain's real values.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    action: varchar('action', { length: 64 }).notNull(),
    entity: varchar('entity', { length: 64 }).notNull(),
    entityId: varchar('entity_id', { length: 128 }),
    before: jsonb('before'),
    after: jsonb('after'),
    actorId: integer('actor_id'),
    requestId: varchar('request_id', { length: 64 }),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_entity_entity_id_idx').on(table.entity, table.entityId),
    index('audit_logs_actor_id_idx').on(table.actorId),
    index('audit_logs_at_idx').on(table.at),
  ],
);
