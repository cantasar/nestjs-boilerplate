import type { Notification } from '../../../shared/database/types/notification-select.type';
import type {
  ListForUserParams,
  NotificationPage,
  NotifyUserParams,
  PersistInboxParams,
} from './notification.types';

/**
 * Provider-agnostic notification inbox port. Consumers inject the
 * `NOTIFICATION_PORT` token, never the concrete service, so the persistence
 * backend (Drizzle reference impl, or any other store) can be swapped without
 * touching callers. Localization and recipient filtering are the caller's job —
 * the port stores and reads already-resolved rows.
 */
export interface NotificationPort {
  /**
   * Transactional (single-user) send: persists one inbox row and, when a push
   * alias is supplied, delivers one push. Push failure is recorded as a delivery
   * status, never thrown, so the caller's request is not coupled to the push
   * provider. Bulk fan-out goes through the broadcast queue, not this path.
   */
  notifyUser(params: NotifyUserParams): Promise<Notification>;

  /** Persist one inbox row without any push side-channel. */
  persistInbox(params: PersistInboxParams): Promise<Notification>;

  /**
   * Mark a row read for its owner. Returns false when the row does not exist,
   * is not owned by the user, or was already read/deleted.
   */
  markRead(id: number, recipientUserId: number): Promise<boolean>;

  /** Number of unread, non-deleted notifications for a recipient. */
  unreadCount(recipientUserId: number): Promise<number>;

  /** Paginated listing of a recipient's inbox, newest first. */
  listForUser(params: ListForUserParams): Promise<NotificationPage>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');
