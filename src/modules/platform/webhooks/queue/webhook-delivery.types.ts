import type { WebhookEndpoint } from '../interfaces/webhook-endpoint.interface';

/** Named job type within the webhook-delivery queue. */
export const WEBHOOK_DELIVERY_JOB = 'webhook-delivery';

/** One delivery chunk. `meta` is copied into every chunk's POST body. */
export interface WebhookDeliveryJob {
  endpoint: WebhookEndpoint;
  chunkIndex: number;
  chunkCount: number;
  items: unknown[]; // caller-owned JSON-serializable payload slice
  meta?: Record<string, string>;
}
