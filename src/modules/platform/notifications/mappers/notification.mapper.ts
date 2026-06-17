import type { Notification } from '../../../shared/database/types/notification-select.type';
import { NotificationResponseDto } from '../dto/notification-response.dto';

/**
 * Pure row → response mapping. Projects only the client-facing fields, dropping
 * internal columns (`pushSentAt`, `deletedAt`) so they never leak in the API
 * envelope.
 */
export function toNotificationResponse(
  row: Notification,
): NotificationResponseDto {
  return {
    id: row.id,
    recipientUserId: row.recipientUserId,
    type: row.type,
    title: row.title,
    body: row.body,
    deepLink: row.deepLink,
    iconUrl: row.iconUrl,
    payload: row.payload,
    broadcastId: row.broadcastId,
    pushDeliveryStatus: row.pushDeliveryStatus,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}
