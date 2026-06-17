import {
  pgTable,
  bigserial,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import {
  notificationTypeEnum,
  pushDeliveryStatusEnum,
} from './enums/notification-type.enum';

/**
 * Generic per-recipient notification inbox. One row is the canonical record of a
 * message delivered to a single user; the push side-channel (OneSignal etc.) is
 * tracked separately via `pushDeliveryStatus`/`pushSentAt`. A `broadcastId`
 * groups rows produced by one fan-out so a consuming app can correlate them; the
 * platform layer assigns no meaning to the value beyond grouping.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    recipientUserId: integer('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    deepLink: text('deep_link'),
    iconUrl: text('icon_url'),
    payload: jsonb('payload').default({}).notNull(),
    broadcastId: varchar('broadcast_id', { length: 64 }),
    pushDeliveryStatus: pushDeliveryStatusEnum('push_delivery_status'),
    pushSentAt: timestamp('push_sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('notifications_recipient_created_idx').on(
      table.recipientUserId,
      table.createdAt,
    ),
    index('notifications_broadcast_id_idx').on(table.broadcastId),
  ],
);
