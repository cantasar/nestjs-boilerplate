// V4 signed-URL generation on Cloud Run (no local key) calls the IAM signBlob
// REST API, which intermittently drops the socket. These tune the per-key retry
// and cap how many signBlob calls fire at once (~100 image keys per request).
export const SIGNING_RETRY_ATTEMPTS = 4; // 1 try + 3 retries
export const SIGNING_RETRY_BASE_DELAY_MS = 150; // 150 / 300 / 600 ms
export const SIGNING_RETRY_MAX_JITTER_MS = 100;
export const SIGNING_MAX_CONCURRENCY = 8;

export const TRANSIENT_SIGNING_MARKERS = [
  'premature close',
  'econnreset',
  'etimedout',
  'socket hang up',
  'epipe',
  'eai_again',
] as const;
