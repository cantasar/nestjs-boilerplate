import type { LocalizedText } from './notification.types';

/** Parameters for a single push fan-out to a set of provider-side aliases. */
export interface SendPushParams {
  /** Provider-side recipient aliases (e.g. OneSignal external ids). */
  externalIds: string[];
  title: LocalizedText;
  body: LocalizedText;
  data?: Record<string, unknown>;
  url?: string;
  iconUrl?: string;
}

/** Outcome of one push call, so callers can record per-row delivery status. */
export interface SendPushResult {
  delivered: boolean;
  /** True when the send was a no-op (provider disabled or no targets). */
  skipped?: boolean;
  recipients?: number;
  providerMessageId?: string;
  error?: string;
}

/**
 * Provider-agnostic push port. Consumers inject the `PUSH_SENDER` token, never a
 * concrete provider class, so OneSignal/FCM/APNs/etc. can be swapped behind the
 * token. A disabled provider returns `{ delivered: false, skipped: true }`
 * rather than throwing, so callers can mark rows SKIPPED instead of retrying.
 */
export interface PushSender {
  isEnabled(): boolean;
  sendToExternalIds(params: SendPushParams): Promise<SendPushResult>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');
