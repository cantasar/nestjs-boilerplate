import { TRANSIENT_SIGNING_MARKERS } from '../constants/signing-retry.constants';

/**
 * True when an error looks like a transient signBlob socket failure (safe to
 * retry); auth/permission/config errors return false so they fail fast.
 */
export function isTransientSigningError(error: unknown): boolean {
  // boundary: validated
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return TRANSIENT_SIGNING_MARKERS.some((marker) => message.includes(marker));
}
