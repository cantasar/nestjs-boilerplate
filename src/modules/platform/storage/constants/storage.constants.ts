/** Common Cache-Control presets for `uploadObject`/`presignUpload` callers. */
export const MEDIA_CACHE_CONTROL = {
  staticImmutable: 'public, max-age=31536000, immutable',
  videoLong: 'public, max-age=2592000',
} as const;

/** Redis key prefix under which presigned READ URLs are cached. */
export const PRESIGN_CACHE_PREFIX = 'presign:read:';
