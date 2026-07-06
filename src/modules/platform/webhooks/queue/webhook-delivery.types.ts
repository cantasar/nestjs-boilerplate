import type { WebhookEndpoint } from '../interfaces/webhook-endpoint.interface';

/** Named job type within the webhook-delivery queue. */
export const WEBHOOK_DELIVERY_JOB = 'webhook-delivery';

/**
 * One delivery chunk. `items` is the payload slice; `meta` (optional, flat
 * string map) is spread into the POSTed envelope alongside chunk bookkeeping —
 * e.g. `{ generatedAt }` so every chunk of one logical batch carries the same
 * snapshot timestamp.
 */
export interface WebhookDeliveryJob {
  endpoint: WebhookEndpoint;
  chunkIndex: number;
  chunkCount: number;
  items: unknown[]; // boundary: validated — caller-owned JSON-serializable payload slice
  meta?: Record<string, string>;
}
