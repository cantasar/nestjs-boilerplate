import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import {
  PUSH_SENDER,
  type PushSender,
} from '../interfaces/push-sender.interface';
import { PushDeliveryStatus } from '../../../shared/database/schema/enums/notification-type.enum';
import { paginate } from '../../../shared/common/utils/pagination.util';
import type { NotificationPort } from '../interfaces/notification-port.interface';
import type {
  ListForUserParams,
  NotificationPage,
  PersistInboxParams,
} from '../interfaces/notification.types';
import type { Notification } from '../../../shared/database/types/notification-select.type';

/**
 * Drizzle-backed reference implementation of `NotificationPort`. Persists one
 * inbox row, then fires a single push through the `PUSH_SENDER` port and records
 * the resulting delivery status. Bulk fan-out goes through the broadcast queue
 * (never synchronously here) — this path is for one-off / transactional sends.
 */
@Injectable()
export class NotificationService implements NotificationPort {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly repo: NotificationRepository,
    @Inject(PUSH_SENDER) private readonly pushSender: PushSender,
  ) {}

  async persistInbox(params: PersistInboxParams): Promise<Notification> {
    const notification = await this.repo.create({
      recipientUserId: params.recipientUserId,
      type: params.type,
      title: params.title,
      body: params.body,
      deepLink: params.deepLink,
      iconUrl: params.iconUrl,
      payload: params.payload ?? {},
      broadcastId: params.broadcastId ?? null,
      pushDeliveryStatus: PushDeliveryStatus.PENDING,
    });
    return notification;
  }

  /**
   * Persist + push one notification to a single provider-side alias. Returns the
   * stored row; push failure is recorded as FAILED status but never thrown so a
   * transactional caller's request is not coupled to the push provider.
   */
  async sendToUser(
    params: PersistInboxParams & { pushExternalId: string | null },
  ): Promise<Notification> {
    const notification = await this.persistInbox(params);

    if (!params.pushExternalId) {
      await this.repo.markPushStatusByIds(
        [notification.id],
        PushDeliveryStatus.SKIPPED,
      );
      return notification;
    }

    const result = await this.pushSender.sendToExternalIds({
      externalIds: [params.pushExternalId],
      title: { default: params.title },
      body: { default: params.body },
      url: params.deepLink,
      iconUrl: params.iconUrl,
      data: { ...params.payload, notificationId: notification.id },
    });

    const status = result.skipped
      ? PushDeliveryStatus.SKIPPED
      : result.delivered
        ? PushDeliveryStatus.SENT
        : PushDeliveryStatus.FAILED;
    await this.repo.markPushStatusByIds([notification.id], status);

    if (!result.delivered && !result.skipped) {
      this.logger.warn(
        `Push failed for user=${params.recipientUserId} notification=${notification.id}: ${result.error}`,
      );
    }
    return notification;
  }

  async markRead(id: number, recipientUserId: number): Promise<boolean> {
    return this.repo.markRead(id, recipientUserId);
  }

  async listForUser(params: ListForUserParams): Promise<NotificationPage> {
    const { rows, totalCount } = await this.repo.findPage(params);
    return paginate(rows, totalCount, params.page, params.limit);
  }
}
