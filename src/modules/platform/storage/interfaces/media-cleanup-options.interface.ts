/** One storage prefix the sweep scans, with its own orphan grace window. */
export interface MediaPrefixSpec {
  /** Object-key prefix to scan, e.g. `uploads/` or `avatars/`. */
  prefix: string;
  /** How long an unreferenced object is kept before it is eligible for delete. */
  graceMs: number;
}

/**
 * Configuration for the generic media-cleanup sweep. Supplied via the
 * `MEDIA_CLEANUP_OPTIONS` token. With no prefixes the sweep is a no-op, so the
 * job ships dormant until a consuming app opts in.
 */
export interface MediaCleanupOptions {
  prefixes: MediaPrefixSpec[];
}

export const MEDIA_CLEANUP_OPTIONS = Symbol('MEDIA_CLEANUP_OPTIONS');
