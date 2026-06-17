/** Allowed image MIME types for upload + variant processing. */
export const MEDIA_MIME_IMAGE = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Allowed video MIME types for upload (never variant-processed). */
export const MEDIA_MIME_VIDEO = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

export const MEDIA_ALLOWED_MIMES: readonly string[] = [
  ...MEDIA_MIME_IMAGE,
  ...MEDIA_MIME_VIDEO,
];

/** Max upload size by media class, enforced before a signed URL is issued. */
export const MEDIA_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MEDIA_MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/** Discriminator value for an uploaded-but-unbound asset. */
export const LIBRARY_ENTITY_TYPE = 'library';

/**
 * Parameters for initiating an upload. The caller supplies the file metadata
 * and an optional generic entity binding; the port issues a signed PUT URL and
 * persists the asset row.
 */
export interface PresignUploadParams {
  filename: string;
  mimeType: string;
  fileSize: number;
  uploaderId: number;
  tags?: string[];
  /** Optional generic entity binding (defaults to the unbound library). */
  entityType?: string;
  entityId?: string;
  entitySubtype?: string;
}

/** Result of an upload-init: the persisted asset id plus signed URLs. */
export interface PresignUploadResult {
  assetId: number;
  storageKey: string;
  uploadUrl: string;
  previewUrl: string;
  expiresIn: number;
  cacheControl: string;
  maxFileSize: number;
}

/**
 * Parameters for registering an asset that already exists in storage (uploaded
 * out-of-band) against a generic entity reference.
 */
export interface RegisterAssetParams {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  uploaderId?: number;
  tags?: string[];
  entityType?: string;
  entityId?: string;
  entitySubtype?: string;
}

/** Signed read URLs for an asset's original + processed variants. */
export interface MediaAssetUrls {
  original: string | null;
  medium: string | null;
  thumbnail: string | null;
}

/** A media asset enriched with signed read URLs for client consumption. */
export interface MediaAssetView {
  id: number;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  entityType: string;
  entityId: string | null;
  entitySubtype: string | null;
  tags: string[];
  uploadedBy: number | null;
  attachedAt: Date | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  previewUrl: string | null;
  urls: MediaAssetUrls;
}
