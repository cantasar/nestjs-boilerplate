import {
  bigserial,
  index,
  integer,
  jsonb,
  timestamp,
  varchar,
  pgTable,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Generic media-asset registry. One row per uploaded object plus its derived
 * variants. The entity reference is intentionally untyped at the DB level —
 * `entityType`/`entityId`/`entitySubtype` are free-form strings with NO foreign
 * key into any domain table, so a consuming app binds assets to its own
 * entities (`product:42`, `avatar:7`, `post:abc`) without the platform layer
 * knowing those tables exist. Unbound assets sit under the `'library'` type.
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    storageKey: varchar('storage_key', { length: 1024 }).notNull().unique(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 127 }).notNull(),
    size: integer('size').notNull(),
    /** Generic entity-ref discriminator; defaults to the unbound library. */
    entityType: varchar('entity_type', { length: 64 })
      .default('library')
      .notNull(),
    /** Generic entity-ref id (stringified — domain decides the shape). */
    entityId: varchar('entity_id', { length: 255 }),
    /** Optional slot/sub-key within an entity (e.g. a gallery position). */
    entitySubtype: varchar('entity_subtype', { length: 255 }),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    uploadedBy: integer('uploaded_by'),
    thumbnailKey: varchar('thumbnail_key', { length: 1024 }),
    mediumKey: varchar('medium_key', { length: 1024 }),
    attachedAt: timestamp('attached_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    index('media_assets_entity_idx').on(table.entityType, table.entityId),
    index('media_assets_uploaded_by_idx').on(table.uploadedBy),
  ],
);
