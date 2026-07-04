/**
 * Delivery target, referenced by ENV VAR NAMES rather than values so the
 * secret (and URL) never travel through Redis inside job payloads — the
 * processor resolves them at send time. One module serves any number of
 * webhook integrations; each consuming feature passes its own endpoint config.
 */
export interface WebhookEndpoint {
  /** Env var holding the receiver URL (e.g. "ORDER_EVENTS_WEBHOOK_URL").
   *  Unset/empty at delivery time → the chunk is dropped with a warning. */
  urlEnvVar: string;
  /** Env var holding the shared HMAC secret. Unset/empty → the chunk is
   *  REFUSED (never send unsigned payloads). */
  secretEnvVar: string;
  /** Signature header name. Defaults to `X-Webhook-Signature`. */
  signatureHeader?: string;
}
