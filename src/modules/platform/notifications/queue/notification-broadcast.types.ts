import type { NotificationType } from '../../../shared/database/schema/enums/notification-type.enum';
import type {
  BroadcastRecipient,
  LocalizedCopy,
} from '../interfaces/notification.types';

/** Named job carrying one chunk of a broadcast fan-out. */
export const BROADCAST_CHUNK_JOB = 'broadcast-chunk';

/**
 * One chunk of a broadcast: a bounded slice of recipients plus the localized
 * copy to deliver to each. The producer splits a broadcast into these so each
 * worker run stays small and retryable; the worker persists the inbox rows then
 * pushes to the chunk's external ids.
 */
export interface BroadcastChunkJob {
  /** Groups every chunk of one fan-out; null for an unattributed broadcast. */
  broadcastId: string | null;
  type: NotificationType;
  recipients: BroadcastRecipient[];
  title: LocalizedCopy;
  body: LocalizedCopy;
  deepLink?: string;
  iconUrl?: string;
  payload?: Record<string, unknown>;
}

/** Outcome of one chunk job, returned for logging/metrics. */
export interface BroadcastChunkResult {
  inserted: number;
  pushed: boolean;
  recipients: number;
}
