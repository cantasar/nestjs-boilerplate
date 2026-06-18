/**
 * Pure helpers for the push sender's in-call retry of transient transport
 * errors (DNS/connection resets, 429s, 5xx). Provider-agnostic — they inspect
 * only the common Node/HTTP error shapes, not any vendor SDK type.
 */

const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNREFUSED',
]);

export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  if (code && TRANSIENT_CODES.has(code)) return true;
  const status =
    (err as { status?: number }).status ??
    (err as { httpCode?: number }).httpCode;
  if (typeof status === 'number') return status === 429 || status >= 500;
  const msg = ((err as { message?: string }).message ?? '').toLowerCase();
  return msg.includes('timeout') || msg.includes('socket hang up');
}

export const sleep = (ms: number): Promise<void> =>
  // void-ok
  new Promise((resolve) => setTimeout(resolve, ms));
