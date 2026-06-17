import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DATABASE_TOKENS } from '../../../shared/database/database.tokens';
import type { DrizzleDB } from '../../../shared/database/database.types';
import { notifications } from '../../../shared/database/schema/notification.schema';
import { PushDeliveryStatus } from '../../../shared/database/schema/enums/notification-type.enum';
import type { Notification } from '../../../shared/database/types/notification-select.type';
import type { NewNotification } from '../../../shared/database/types/notification-insert.type';
import type { ListForUserParams } from '../interfaces/notification.types';

/**
 * Drizzle reference persistence for the notification inbox. Pure data access —
 * all localization/preference logic lives in the service above it.
 */
@Injectable()
export class NotificationRepository {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async create(data: NewNotification): Promise<Notification> {
    const [row] = await this.db.insert(notifications).values(data).returning();
    if (!row) throw new Error('Failed to insert notification row');
    return row;
  }

  /** Bulk inbox insert for a broadcast chunk. Returns the inserted rows. */
  async bulkInsert(rows: NewNotification[]): Promise<Notification[]> {
    if (rows.length === 0) return [];
    return this.db.insert(notifications).values(rows).returning();
  }

  async findPage(
    params: ListForUserParams,
  ): Promise<{ rows: Notification[]; totalCount: number }> {
    const { recipientUserId, page, limit, unreadOnly } = params;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(notifications.recipientUserId, recipientUserId),
      isNull(notifications.deletedAt),
    ];
    if (unreadOnly) conditions.push(isNull(notifications.readAt));
    const where = and(...conditions);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit)
        .offset(offset),
      this.db.select({ value: count() }).from(notifications).where(where),
    ]);
    return { rows, totalCount: totals?.value ?? 0 };
  }

  async markRead(id: number, recipientUserId: number): Promise<boolean> {
    const result = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.recipientUserId, recipientUserId),
          isNull(notifications.readAt),
          isNull(notifications.deletedAt),
        ),
      )
      .returning({ id: notifications.id });
    return result.length > 0;
  }

  // void-ok: status update acknowledges by resolving.
  async markPushStatusByIds(
    ids: number[],
    status: PushDeliveryStatus,
  ): Promise<void> {
    // void-ok
    if (ids.length === 0) return;
    await this.db
      .update(notifications)
      .set({
        pushDeliveryStatus: status,
        pushSentAt: status === PushDeliveryStatus.SENT ? new Date() : null,
      })
      .where(inArray(notifications.id, ids));
  }
}
