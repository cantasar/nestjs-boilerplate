import { Inject, Injectable, Logger } from '@nestjs/common';
import { MEDIA_CACHE_CONTROL } from '../../storage/constants/storage.constants';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../../storage/interfaces/storage.types';
import type { MediaAsset } from '../../../shared/database/types';
import { MediaAssetRepository } from '../media-asset.repository';
import { MEDIA_MIME_IMAGE } from '../interfaces/asset.types';

const THUMBNAIL_DIM = 150;
const MEDIUM_WIDTH = 800;
const VARIANT_QUALITY = 82;

/** Minimal structural type for the slice of `sharp` this service uses. */
interface SharpInstance {
  resize(
    width: number,
    height?: number,
    opts?: { fit?: string; withoutEnlargement?: boolean },
  ): SharpInstance;
  resize(opts: { width: number; withoutEnlargement?: boolean }): SharpInstance;
  jpeg(opts: { quality: number; mozjpeg?: boolean }): SharpInstance;
  toBuffer(): Promise<Buffer>;
}
type SharpFactory = (input: Buffer) => SharpInstance;

/**
 * Generates `thumbnail` + `medium` JPEG variants from an image original via
 * `sharp`. `sharp` is an OPTIONAL peer dependency loaded lazily: if it is not
 * installed the service logs a warning and no-ops (the original asset is still
 * usable), so the platform builds and runs without the native dependency.
 */
@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name);
  private sharpFactory: SharpFactory | null | undefined;

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly repository: MediaAssetRepository,
  ) {}

  isImage(mimeType: string): boolean {
    return (MEDIA_MIME_IMAGE as readonly string[]).includes(mimeType);
  }

  async ensureProcessed(asset: MediaAsset): Promise<MediaAsset> {
    if (asset.processedAt) return asset;
    if (!this.isImage(asset.mimeType)) return asset;

    const sharp = await this.loadSharp();
    if (!sharp) {
      this.logger.warn(
        `sharp not installed; skipping variant generation for asset ${asset.id}`,
      );
      return asset;
    }

    const original = await this.storage.downloadObject(asset.storageKey);
    const { dir, stem } = this.splitKey(asset.storageKey);
    const thumbnailKey = `${dir}${stem}-thumb.jpg`;
    const mediumKey = `${dir}${stem}-medium.jpg`;

    const [thumbnailBuf, mediumBuf] = await Promise.all([
      sharp(original)
        .resize(THUMBNAIL_DIM, THUMBNAIL_DIM, { fit: 'cover' })
        .jpeg({ quality: VARIANT_QUALITY, mozjpeg: true })
        .toBuffer(),
      sharp(original)
        .resize({ width: MEDIUM_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: VARIANT_QUALITY, mozjpeg: true })
        .toBuffer(),
    ]);

    await Promise.all([
      this.storage.uploadObject(
        thumbnailKey,
        thumbnailBuf,
        'image/jpeg',
        MEDIA_CACHE_CONTROL.staticImmutable,
      ),
      this.storage.uploadObject(
        mediumKey,
        mediumBuf,
        'image/jpeg',
        MEDIA_CACHE_CONTROL.staticImmutable,
      ),
    ]);

    const updated = await this.repository.update(asset.id, {
      thumbnailKey,
      mediumKey,
      processedAt: new Date(),
    });
    return updated ?? asset;
  }

  /**
   * Lazily resolve the `sharp` factory. Caches the result (including the
   * `null` "not installed" outcome) so a missing dependency is probed once.
   */
  private async loadSharp(): Promise<SharpFactory | null> {
    if (this.sharpFactory !== undefined) return this.sharpFactory;
    try {
      // Indirected specifier so TS does not statically resolve (and require)
      // the optional `sharp` dependency at build time — it is loaded only if
      // the consuming app installed it.
      const specifier = 'sharp';
      const mod = (await import(specifier)) as { default: SharpFactory };
      this.sharpFactory = mod.default;
    } catch {
      this.sharpFactory = null;
    }
    return this.sharpFactory;
  }

  private splitKey(key: string): { dir: string; stem: string } {
    const slash = key.lastIndexOf('/');
    const dir = slash >= 0 ? key.slice(0, slash + 1) : '';
    const filename = slash >= 0 ? key.slice(slash + 1) : key;
    const dot = filename.lastIndexOf('.');
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    return { dir, stem };
  }
}
