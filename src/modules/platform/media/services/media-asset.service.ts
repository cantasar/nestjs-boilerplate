import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../../shared/common/errors/domain.exception';
import { MediaErrorCode } from '../../../shared/common/errors/error-codes';
import { sanitizeFilename } from '../../storage/utils/sanitize-filename';
import { MEDIA_CACHE_CONTROL } from '../../storage/constants/storage.constants';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../../storage/interfaces/storage.types';
import type { MediaAsset } from '../../../shared/database/types';
import type { AssetPort } from '../interfaces/asset-port.interface';
import {
  LIBRARY_ENTITY_TYPE,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_VIDEO_BYTES,
  MEDIA_MIME_VIDEO,
  type MediaAssetView,
  type PresignUploadParams,
  type PresignUploadResult,
  type RegisterAssetParams,
} from '../interfaces/asset.types';
import { MediaAssetRepository } from '../media-asset.repository';
import { MediaProcessingQueueService } from '../queue/media-processing-queue.service';

const PREVIEW_TTL_SECONDS = 60 * 60;

/**
 * Drizzle + storage-backed reference implementation of `AssetPort`. Issues
 * signed upload/read URLs via the `STORAGE_SERVICE` port and persists asset
 * rows with a free-form generic entity binding. No domain knowledge — the
 * `(entityType, entityId)` pair is opaque.
 */
@Injectable()
export class MediaAssetService implements AssetPort {
  constructor(
    private readonly config: ConfigService,
    private readonly repository: MediaAssetRepository,
    private readonly processingQueue: MediaProcessingQueueService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async presignUpload(
    params: PresignUploadParams,
  ): Promise<PresignUploadResult> {
    const maxFileSize = this.maxFileSizeFor(params.mimeType);
    if (params.fileSize > maxFileSize) {
      throw new DomainException(MediaErrorCode.FILE_SIZE_EXCEEDS_LIMIT, {
        params: { fileSize: params.fileSize, maxFileSize },
      });
    }

    const entityType = params.entityType ?? LIBRARY_ENTITY_TYPE;
    const filename = sanitizeFilename(params.filename);
    const storageKey = this.buildStorageKey({
      entityType,
      entityId: params.entityId ?? null,
      uploaderId: params.uploaderId,
      tail: `${randomUUID()}-${filename}`,
    });

    const cacheControl = this.isVideo(params.mimeType)
      ? MEDIA_CACHE_CONTROL.videoLong
      : MEDIA_CACHE_CONTROL.staticImmutable;

    const uploadUrl = await this.storage.presignUpload({
      key: storageKey,
      contentType: params.mimeType,
      cacheControl,
    });

    const bound = entityType !== LIBRARY_ENTITY_TYPE;
    const created = await this.repository.create({
      storageKey,
      originalFilename: filename,
      mimeType: params.mimeType,
      size: params.fileSize,
      entityType,
      entityId: params.entityId ?? null,
      entitySubtype: params.entitySubtype ?? null,
      tags: params.tags ?? [],
      uploadedBy: params.uploaderId,
      attachedAt: bound ? new Date() : null,
    });

    const previewUrl = await this.storage.presignRead({
      key: storageKey,
      expiresIn: PREVIEW_TTL_SECONDS,
    });

    return {
      assetId: created.id,
      storageKey,
      uploadUrl,
      previewUrl,
      expiresIn: this.uploadExpiry(),
      cacheControl,
      maxFileSize,
    };
  }

  async registerAsset(params: RegisterAssetParams): Promise<MediaAssetView> {
    const entityType = params.entityType ?? LIBRARY_ENTITY_TYPE;
    const created = await this.repository.create({
      storageKey: params.storageKey,
      originalFilename: params.originalFilename,
      mimeType: params.mimeType,
      size: params.size,
      entityType,
      entityId: params.entityId ?? null,
      entitySubtype: params.entitySubtype ?? null,
      tags: params.tags ?? [],
      uploadedBy: params.uploaderId ?? null,
      attachedAt: entityType !== LIBRARY_ENTITY_TYPE ? new Date() : null,
    });
    return this.toView(created);
  }

  async listByEntity(
    entityType: string,
    entityId: string,
  ): Promise<MediaAssetView[]> {
    const rows = await this.repository.findByEntity(entityType, entityId);
    if (rows.length === 0) return [];
    const keys = this.collectKeys(rows);
    const urlMap = await this.storage.presignReadMany(
      keys,
      PREVIEW_TTL_SECONDS,
    );
    return rows.map((row) => this.toViewWithUrls(row, urlMap));
  }

  /**
   * Schedule variant generation on the media-processing worker. Idempotent: the
   * worker no-ops if the asset is already processed or `sharp` is unavailable.
   */
  async process(assetId: number): Promise<MediaAssetView> {
    const asset = await this.repository.findById(assetId);
    if (!asset) {
      throw new DomainException(MediaErrorCode.ASSET_NOT_FOUND, {
        params: { id: assetId },
      });
    }
    await this.processingQueue.enqueue(assetId);
    const keys = this.collectKeys([asset]);
    const urlMap = await this.storage.presignReadMany(
      keys,
      PREVIEW_TTL_SECONDS,
    );
    return this.toViewWithUrls(asset, urlMap);
  }

  private async toView(asset: MediaAsset): Promise<MediaAssetView> {
    const keys = this.collectKeys([asset]);
    const urlMap = await this.storage.presignReadMany(
      keys,
      PREVIEW_TTL_SECONDS,
    );
    return this.toViewWithUrls(asset, urlMap);
  }

  private toViewWithUrls(
    asset: MediaAsset,
    urlMap: Map<string, string>,
  ): MediaAssetView {
    return {
      id: asset.id,
      storageKey: asset.storageKey,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      size: asset.size,
      entityType: asset.entityType,
      entityId: asset.entityId,
      entitySubtype: asset.entitySubtype,
      tags: asset.tags ?? [],
      uploadedBy: asset.uploadedBy,
      attachedAt: asset.attachedAt,
      processedAt: asset.processedAt,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      previewUrl: urlMap.get(asset.storageKey) ?? null,
      urls: {
        original: urlMap.get(asset.storageKey) ?? null,
        medium: asset.mediumKey ? (urlMap.get(asset.mediumKey) ?? null) : null,
        thumbnail: asset.thumbnailKey
          ? (urlMap.get(asset.thumbnailKey) ?? null)
          : null,
      },
    };
  }

  private collectKeys(rows: MediaAsset[]): string[] {
    return rows.flatMap((r) =>
      [r.storageKey, r.thumbnailKey, r.mediumKey].filter((k): k is string =>
        Boolean(k),
      ),
    );
  }

  /**
   * Generic storage-key layout: `<entityType>/<entityId|uploaderId>/<tail>`.
   * Unbound library uploads are namespaced by uploader. No domain prefixes.
   */
  private buildStorageKey(params: {
    entityType: string;
    entityId: string | null;
    uploaderId: number;
    tail: string;
  }): string {
    const { entityType, entityId, uploaderId, tail } = params;
    if (entityType === LIBRARY_ENTITY_TYPE || !entityId) {
      return `${LIBRARY_ENTITY_TYPE}/${uploaderId}/${tail}`;
    }
    return `${this.tokenize(entityType)}/${this.tokenize(entityId)}/${tail}`;
  }

  private tokenize(s: string): string {
    return (
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'x'
    );
  }

  private isVideo(mimeType: string): boolean {
    return (MEDIA_MIME_VIDEO as readonly string[]).includes(mimeType);
  }

  private maxFileSizeFor(mimeType: string): number {
    return this.isVideo(mimeType)
      ? MEDIA_MAX_VIDEO_BYTES
      : MEDIA_MAX_IMAGE_BYTES;
  }

  private uploadExpiry(): number {
    return this.config.get<number>('GCS_PRESIGN_EXPIRES') ?? 900;
  }
}
