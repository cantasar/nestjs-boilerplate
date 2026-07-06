# Signed webhook delivery — sender semantics + receiver contract

Implementation: `src/modules/platform/webhooks/` (`WebhookDeliveryService` +
`WebhookDeliveryProcessor`). One generic module serves any number of outbound
integrations; each feature passes its own `WebhookEndpoint` (env-var NAMES for
URL + secret, so secrets never enter Redis job payloads).

## Sender semantics (what this module guarantees)

- **Envelope** (chunked, ≤500 items/POST by default; `chunkIndex` 0-based):
  ```json
  { "...meta": "…", "chunkIndex": 0, "chunkCount": 3, "items": [ … ] }
  ```
  `meta` (e.g. a batch `generatedAt`) is repeated on every chunk of a batch.
- **Signature**: header `X-Webhook-Signature: sha256=<hex>` where `<hex>` =
  HMAC-SHA256 of the **raw UTF-8 request body bytes exactly as sent**.
- **Refuse-unsigned**: if the secret env var is unset, the chunk is dropped
  with an error log — an unsigned payload never ships.
- **No-op when unconfigured**: if the URL env var is unset, `deliver()` (and a
  stale queued job) is a logged no-op — webhook push is an optional
  integration, never a hard dependency.
- **Retry**: 5 attempts, exponential backoff (base 10s) per chunk; dropped
  after exhaustion. **At-least-once** — duplicates are possible.
- **Per-chunk independence**: no cross-chunk ordering; one chunk can fail
  while others succeed.

## Receiver contract (hand this to the integrating team)

1. **Verify before parsing** — HMAC over the raw body, constant-time compare:
   ```js
   import crypto from 'node:crypto';

   function verify(rawBody, header, secret) {
     const expected = 'sha256=' +
       crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
     const a = Buffer.from(header ?? '');
     const b = Buffer.from(expected);
     return a.length === b.length && crypto.timingSafeEqual(a, b);
   }
   // Express: app.use(express.raw({ type: 'application/json' })) so the
   // buffer used above is the exact bytes; JSON.parse only after verifying.
   ```
   Never re-serialize parsed JSON to verify — key order/whitespace must match.
2. **Return 2xx to ack.** A 5xx/408/429, a network error, or the sender-side
   15s timeout triggers a retry; any other 4xx is a deterministic failure and
   fails WITHOUT retry. Redirects are never followed (3xx = failure).
3. **Idempotency**: dedupe/upsert by your item's natural key + the batch
   version in `meta` (e.g. `generatedAt`); ignore an older version than the
   one you last stored. There is no per-request event id.
4. **Replay**: no timestamp header — enforce freshness from the batch `meta`
   (reject envelopes older than your last processed snapshot).

## Wiring a new integration

```ts
// feature module
imports: [WebhookDeliveryModule]

// feature service
await this.webhooks.deliver(
  { urlEnvVar: 'ORDER_EVENTS_WEBHOOK_URL', secretEnvVar: 'ORDER_EVENTS_WEBHOOK_SECRET' },
  rows,
  { generatedAt },
);
```

Add the two env vars to `env.schema.ts` (optional — the module no-ops without
them) and `.env.example`. Ask the receiving team for a URL + a ≥32-byte shared
secret.

Origin: cilt365 product-popularity webhook (nightly aggregate push to the
product team), generalized.
