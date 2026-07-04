/** Max payload items per POST — receivers get bounded request bodies. */
export const WEBHOOK_DELIVERY_CHUNK_SIZE = 500;

/** Default signature header when the endpoint config doesn't override it. */
export const WEBHOOK_SIGNATURE_HEADER = 'X-Webhook-Signature';

/** Delivery retry policy: 5 attempts, exponential backoff from 10s. */
export const WEBHOOK_DELIVERY_ATTEMPTS = 5;
export const WEBHOOK_DELIVERY_BACKOFF_MS = 10_000;
