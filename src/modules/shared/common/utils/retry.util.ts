/**
 * Retry an async op with exponential backoff. Aimed at transient infra blips —
 * e.g. a managed/serverless Postgres dropping an idle connection or cold-starting
 * (the pool surfaces "Connection terminated" / connection-timeout), which a
 * second attempt a moment later rides out. Rethrows the last error if all
 * attempts fail. Deterministic failures still surface (just `attempts` times).
 *
 * `shouldRetry` lets callers retry only transient errors (e.g. a socket drop)
 * and fail fast on deterministic ones. `maxJitterMs` adds random jitter to the
 * backoff to spread out concurrent retries hitting the same endpoint.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    attempts?: number;
    baseDelayMs?: number;
    maxJitterMs?: number;
    shouldRetry?: (err: unknown) => boolean; // boundary: validated
  } = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxJitterMs = opts.maxJitterMs ?? 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (
        attempt === attempts ||
        (opts.shouldRetry && !opts.shouldRetry(err))
      ) {
        throw err;
      }
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = maxJitterMs > 0 ? Math.random() * maxJitterMs : 0;
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }
  // Unreachable: the loop either returns or throws on the final attempt.
  throw new Error('withRetry: exhausted without resolving');
}
