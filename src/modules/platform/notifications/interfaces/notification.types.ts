import type { NotificationType } from '../../../shared/database/schema/enums/notification-type.enum';
import type { Paginated } from '../../../shared/common/types/paginated.type';
import type { NotificationResponseDto } from '../dto/notification-response.dto';

/**
 * Localized copy with an explicit, always-present default. `default` is the text
 * used when no per-locale override matches the recipient; `byLocale` holds
 * optional overrides keyed by an opaque locale tag (`en`, `de`, `pt-BR`, …). No
 * locale is privileged or assumed — a single-locale app just sets `default`.
 */
export interface LocalizedText {
  default: string;
  byLocale?: Record<string, string>;
}

/** Resolves the best copy for a locale: a per-locale override else the default. */
export function resolveLocalizedText(
  text: LocalizedText,
  locale: string,
): string {
  return text.byLocale?.[locale] ?? text.default;
}

/** Wraps a plain string as `LocalizedText` (single-locale convenience). */
export function plainText(value: string): LocalizedText {
  return { default: value };
}

/** A single recipient targeted by a broadcast fan-out. */
export interface BroadcastRecipient {
  userId: number;
  locale: string;
  /** Provider-side push alias (e.g. OneSignal external id); null = no push target. */
  pushExternalId: string | null;
}

/** Parameters for persisting one notification inbox row for a user. */
export interface PersistInboxParams {
  recipientUserId: number;
  type: NotificationType;
  /** Resolved, single-locale strings (the inbox stores already-resolved copy). */
  title: string;
  body: string;
  deepLink?: string;
  iconUrl?: string;
  payload?: Record<string, unknown>;
  /** Groups rows produced by one fan-out; null for a one-off send. */
  broadcastId?: string | null;
}

/**
 * Parameters for a transactional (single-user) send: persist an inbox row and,
 * when a push alias is supplied, deliver one push. Extends the inbox params with
 * the recipient's provider-side push alias.
 */
export interface NotifyUserParams extends PersistInboxParams {
  /** Provider-side push alias; null skips push (inbox row still persists). */
  pushExternalId: string | null;
}

/** Filters for a recipient's paginated inbox listing. */
export interface ListForUserParams {
  recipientUserId: number;
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

export type NotificationPage = Paginated<NotificationResponseDto>;
