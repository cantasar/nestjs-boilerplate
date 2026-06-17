import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.schema';

/**
 * Bug-report intake + triage registry. `severity`/`status` are free-form strings
 * (validated at the edge by the BugSeverity/BugStatus enums) so the triage
 * workflow can evolve without a migration.
 *
 * The optional `entityType`/`entityId` pair is a GENERIC entity reference with
 * NO foreign key into any domain table — a consuming app links a report to its
 * own entity (`order:42`, `session:abc`) without the platform layer knowing that
 * table exists. `reporterId`/`assigneeId` are the only real FKs (to `users`, SET
 * NULL on delete so a removed account never cascades a report away).
 */
export const bugReports = pgTable(
  'bug_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    severity: varchar('severity', { length: 16 }).notNull().default('medium'),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    route: varchar('route', { length: 255 }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    environment: varchar('environment', { length: 32 }),
    /** Generic entity-ref discriminator (no FK; domain decides the meaning). */
    entityType: varchar('entity_type', { length: 64 }),
    /** Generic entity-ref id (stringified — domain decides the shape). */
    entityId: varchar('entity_id', { length: 255 }),
    reporterId: integer('reporter_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    assigneeId: integer('assignee_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolutionNote: text('resolution_note'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_bug_reports_status_severity').on(table.status, table.severity),
    index('idx_bug_reports_entity').on(table.entityType, table.entityId),
    index('idx_bug_reports_reporter_created').on(
      table.reporterId,
      table.createdAt,
    ),
  ],
);
