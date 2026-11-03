/** Uses env var names, not values, so secrets are never stored in Redis. */
export interface WebhookEndpoint {
  /** Env var with the receiver URL. If unset, delivery is skipped. */
  urlEnvVar: string;
  /** Env var with the HMAC secret. If unset, the chunk is not sent. */
  secretEnvVar: string;
  /** Signature header name. Defaults to `X-Webhook-Signature`. */
  signatureHeader?: string;
}
