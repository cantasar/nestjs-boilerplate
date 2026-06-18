import type {
  MediaAssetView,
  PresignUploadParams,
  PresignUploadResult,
  RegisterAssetParams,
} from './asset.types';

/**
 * Provider-agnostic media-asset port. Consumers inject the `ASSET_PORT` token,
 * never the concrete service, so the persistence/storage backend can be swapped
 * without touching callers. Entity binding is a free-form `(type, id)` pair —
 * the port assigns no meaning to the values beyond grouping, so it never
 * references a consuming app's domain tables.
 */
export interface AssetPort {
  /**
   * Issue a signed upload (PUT) URL and persist the asset row. The client
   * uploads bytes directly to storage; the row carries the metadata + binding.
   */
  presignUpload(params: PresignUploadParams): Promise<PresignUploadResult>;

  /**
   * Register an asset whose bytes already exist in storage against a generic
   * entity reference. Returns the asset view with signed read URLs.
   */
  registerAsset(params: RegisterAssetParams): Promise<MediaAssetView>;

  /**
   * List every asset bound to a generic `(entityType, entityId)` reference,
   * newest first, each enriched with signed read URLs.
   */
  listByEntity(entityType: string, entityId: string): Promise<MediaAssetView[]>;
}

export const ASSET_PORT = Symbol('ASSET_PORT');
