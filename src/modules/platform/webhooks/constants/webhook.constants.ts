/** Max payload items per POST — receivers get bounded request bodies. */
export const WEBHOOK_DELIVERY_CHUNK_SIZE = 500;

/** Default signature header when the endpoint config doesn't override it. */
export const WEBHOOK_SIGNATURE_HEADER = 'X-Webhook-Signature';

/** Retry policy, with exponential backoff. */
export const WEBHOOK_DELIVERY_ATTEMPTS = 5;
export const WEBHOOK_DELIVERY_BACKOFF_MS = 10_000;

/** Per-POST timeout — a hung receiver must not pin a worker slot. */
export const WEBHOOK_DELIVERY_TIMEOUT_MS = 15_000;

/** Envelope bookkeeping keys — `meta` may not shadow these. */
export const WEBHOOK_RESERVED_META_KEYS = [
  'chunkIndex',
  'chunkCount',
  'items',
] as const;
