import type { NotificationType } from '../../../shared/database/schema/enums/notification-type.enum';
import type { Paginated } from '../../../shared/common/types/paginated.type';
import type { NotificationResponseDto } from '../dto/notification-response.dto';

/** Localized copy keyed by locale (`tr`, `en`, …); the default locale is required. */
export interface LocalizedCopy {
  [locale: string]: string | undefined;
}

/** A single recipient targeted by a broadcast fan-out. */
export interface BroadcastRecipient {
  userId: number;
  locale: string;
  /** Provider-side push alias (e.g. OneSignal external id); null = no push target. */
  pushExternalId: string | null;
}

/** Parameters for persisting + (optionally) pushing one notification to a user. */
export interface PersistInboxParams {
  recipientUserId: number;
  type: NotificationType;
  /** Resolved, single-locale strings (the port does not localize). */
  title: string;
  body: string;
  deepLink?: string;
  iconUrl?: string;
  payload?: Record<string, unknown>;
  /** Groups rows produced by one fan-out; null for a one-off send. */
  broadcastId?: string | null;
}

/** Filters for a recipient's paginated inbox listing. */
export interface ListForUserParams {
  recipientUserId: number;
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

export type NotificationPage = Paginated<NotificationResponseDto>;
