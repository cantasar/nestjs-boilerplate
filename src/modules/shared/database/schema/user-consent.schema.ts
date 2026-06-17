import { desc } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { consentStatusEnum } from './enums/consent-status.enum';

/**
 * Append-only consent history: one row per consent transition (accept/revoke)
 * a user makes against a legal-document version. The latest row per
 * (userId, documentSlug) is the current state.
 */
export const userConsents = pgTable(
  'user_consents',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // No FK to legal_documents(slug, version) — append-only history must
    // survive legal-document version deprecation/deletion. Right-to-erasure is
    // handled by the userId CASCADE above.
    documentSlug: varchar('document_slug', { length: 64 }).notNull(),
    documentVersion: varchar('document_version', { length: 32 }).notNull(),
    status: consentStatusEnum('status').notNull(),
    changedAt: timestamp('changed_at').defaultNow().notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),
  },
  (t) => ({
    userDocIdx: index('user_consents_user_doc_idx').on(
      t.userId,
      t.documentSlug,
      desc(t.changedAt),
    ),
  }),
);
