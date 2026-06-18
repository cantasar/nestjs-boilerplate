import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Generic notification categories. `TRANSACTIONAL` is a per-user, opt-out-proof
 * signal (security/account events); `BROADCAST` is a fan-out message a consuming
 * app sends to many recipients via the notification-broadcast queue. Apps that
 * need finer categories add their own values here.
 */
export enum NotificationType {
  TRANSACTIONAL = 'transactional',
  BROADCAST = 'broadcast',
}

export const notificationTypeEnum = pgEnum(
  'notification_type',
  Object.values(NotificationType) as [NotificationType, ...NotificationType[]],
);

/** Per-row outcome of the push side-channel, independent of inbox persistence. */
export enum PushDeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export const pushDeliveryStatusEnum = pgEnum(
  'push_delivery_status',
  Object.values(PushDeliveryStatus) as [
    PushDeliveryStatus,
    ...PushDeliveryStatus[],
  ],
);
