import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { DocumentType } from './enums/document-type.enum';

/**
 * Generic versioned legal/informational document store. Each (slug, version)
 * pair is an immutable published document; `isCurrent` flags the live version
 * a consuming app surfaces. `title`/`content` are i18n maps (`{ locale: text }`)
 * so the platform layer stays language-agnostic.
 */
export const legalDocuments = pgTable(
  'legal_documents',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    version: varchar('version', { length: 32 }).notNull(),
    // Free-form category (see DocumentType placeholder). Plain varchar, NOT a
    // pg enum, so apps add categories without a migration. Only LEGAL_CONSENT
    // docs participate in the consent flow.
    type: varchar('type', { length: 32 })
      .notNull()
      .default(DocumentType.LEGAL_CONSENT),
    title: jsonb('title').$type<Record<string, string>>().notNull(),
    content: jsonb('content').$type<Record<string, string>>().notNull(),
    publishedAt: timestamp('published_at').defaultNow().notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
  },
  (t) => ({
    slugVersionUq: uniqueIndex('legal_documents_slug_version_uq').on(
      t.slug,
      t.version,
    ),
    // Enforces at-most-one is_current=true per slug at the DB level. Without
    // this, two rows for the same slug could both flag as current and GET
    // endpoints would return non-deterministic results.
    slugCurrentUq: uniqueIndex('legal_documents_one_current_per_slug')
      .on(t.slug)
      .where(sql`${t.isCurrent} = true`),
    slugCurrentIdx: index('legal_documents_slug_current_idx').on(
      t.slug,
      t.isCurrent,
    ),
  }),
);
