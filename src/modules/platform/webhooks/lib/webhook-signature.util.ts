import { createHmac } from 'node:crypto';

/**
 * HMAC-SHA256 signature over the EXACT serialized request body bytes, in the
 * conventional `sha256=<hex>` header format. The receiver must verify against
 * the raw body as received (never a re-serialization — key order/whitespace
 * must match) using a constant-time compare.
 */
export function signWebhookBody(secret: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}
