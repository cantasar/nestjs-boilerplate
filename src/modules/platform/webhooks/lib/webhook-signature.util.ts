import { createHmac } from 'node:crypto';

/**
 * Signs the exact body bytes as `sha256=<hex>`. Receivers must verify the raw
 * body (not re-serialized JSON) with a constant-time compare.
 */
export function signWebhookBody(secret: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}
