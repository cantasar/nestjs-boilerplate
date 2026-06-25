import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bucket, Storage } from '@google-cloud/storage';
import type {
  PresignReadParams,
  PresignUploadParams,
  StorageObjectInfo,
  StorageService,
} from '../interfaces/storage.types';
import { withRetry } from '../../../shared/common/utils/retry.util';
import { mapWithConcurrency } from '../../../shared/common/utils/map-with-concurrency';
import { isTransientSigningError } from '../utils/transient-signing-error';
import {
  SIGNING_MAX_CONCURRENCY,
  SIGNING_RETRY_ATTEMPTS,
  SIGNING_RETRY_BASE_DELAY_MS,
  SIGNING_RETRY_MAX_JITTER_MS,
} from '../constants/signing-retry.constants';

/**
 * Google Cloud Storage reference implementation of the {@link StorageService}
 * port. The provider client + bucket are created lazily on first use and cached,
 * so importing the module without GCS configured never touches the network.
 * Swap this class out (behind the `STORAGE_SERVICE` token) to target a different
 * backend without changing any consumer.
 */
@Injectable()
export class GcsStorageService implements StorageService {
  private readonly logger = new Logger(GcsStorageService.name);
  private storage: Storage | undefined;
  private bucketCache: Bucket | undefined;

  constructor(private readonly configService: ConfigService) {}

  async presignUpload(params: PresignUploadParams): Promise<string> {
    const expiresIn = params.expiresIn ?? this.getDefaultExpiry();
    const extensionHeaders: Record<string, string> = {};
    if (params.cacheControl) {
      extensionHeaders['cache-control'] = params.cacheControl;
    }
    if (params.contentLengthRange) {
      // GCS enforces the uploaded object size is within this range when the
      // client sends the matching x-goog-content-length-range header.
      extensionHeaders['x-goog-content-length-range'] =
        `${params.contentLengthRange.min},${params.contentLengthRange.max}`;
    }

    return this.signWithRetry(() =>
      this.bucket()
        .file(params.key)
        .getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + expiresIn * 1000,
          contentType: params.contentType,
          ...(Object.keys(extensionHeaders).length > 0
            ? { extensionHeaders }
            : {}),
        }),
    );
  }

  async presignRead(params: PresignReadParams): Promise<string> {
    const expiresIn = params.expiresIn ?? this.getDefaultExpiry();
    return this.signWithRetry(() =>
      this.bucket()
        .file(params.key)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + expiresIn * 1000,
        }),
    );
  }

  /**
   * V4 signing on Cloud Run (no local key) hits the IAM signBlob API, which can
   * drop the connection transiently. Retry those with backoff + jitter; surface
   * non-transient (auth/permission) errors immediately.
   */
  private async signWithRetry(
    sign: () => Promise<[string, ...unknown[]]>,
  ): Promise<string> {
    const [url] = await withRetry(sign, {
      attempts: SIGNING_RETRY_ATTEMPTS,
      baseDelayMs: SIGNING_RETRY_BASE_DELAY_MS,
      maxJitterMs: SIGNING_RETRY_MAX_JITTER_MS,
      shouldRetry: isTransientSigningError,
    });
    return url;
  }

  async objectExists(key: string): Promise<boolean> {
    const [exists] = await this.bucket().file(key).exists();
    return exists;
  }

  async listObjects(prefix: string): Promise<StorageObjectInfo[]> {
    const [files] = await this.bucket().getFiles({ prefix });
    return files.map((f) => {
      const raw = f.metadata?.timeCreated;
      const parsed = typeof raw === 'string' ? Date.parse(raw) : NaN;
      return { name: f.name, timeCreated: parsed };
    });
  }

  async deleteObject(key: string): Promise<void> {
    // void-ok: resolves once the object is removed (or was already absent).
    try {
      await this.bucket().file(key).delete({ ignoreNotFound: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`deleteObject failed for ${key}: ${message}`);
      throw new InternalServerErrorException(
        `Failed to delete storage object: ${message}`,
      );
    }
  }

  async copyObject(srcKey: string, destKey: string): Promise<void> {
    // void-ok: resolves once the copy completes.
    try {
      await this.bucket().file(srcKey).copy(this.bucket().file(destKey));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `copyObject failed for ${srcKey} -> ${destKey}: ${message}`,
      );
      throw new InternalServerErrorException(
        `Failed to copy storage object: ${message}`,
      );
    }
  }

  async downloadObject(key: string): Promise<Buffer> {
    try {
      const [buffer] = await this.bucket().file(key).download();
      return buffer;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`downloadObject failed for ${key}: ${message}`);
      throw new InternalServerErrorException(
        `Failed to download storage object: ${message}`,
      );
    }
  }

  async uploadObject(
    key: string,
    body: Buffer,
    contentType: string,
    cacheControl?: string,
  ): Promise<void> {
    // void-ok: resolves once the object is persisted.
    try {
      await this.bucket()
        .file(key)
        .save(body, {
          contentType,
          metadata: cacheControl ? { cacheControl } : undefined,
          resumable: false,
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`uploadObject failed for ${key}: ${message}`);
      throw new InternalServerErrorException(
        `Failed to upload storage object: ${message}`,
      );
    }
  }

  async presignReadMany(
    keys: string[],
    expiresIn?: number,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uniqueKeys = Array.from(new Set(keys));
    if (uniqueKeys.length === 0) return result;

    const ttl = expiresIn ?? this.getDefaultExpiry();
    // Cap concurrent signBlob calls and tolerate per-key failures: one flaky
    // key must not blank every URL. Callers treat a missing key as absent.
    const settled = await mapWithConcurrency(
      uniqueKeys,
      SIGNING_MAX_CONCURRENCY,
      (key) => this.presignRead({ key, expiresIn: ttl }),
    );
    let failed = 0;
    settled.forEach((outcome, idx) => {
      if (outcome.status === 'fulfilled') {
        result.set(uniqueKeys[idx]!, outcome.value);
      } else {
        failed++;
      }
    });
    if (failed > 0) {
      this.logger.warn(
        `presignReadMany: ${failed}/${uniqueKeys.length} keys failed to sign`,
      );
    }
    return result;
  }

  private bucket(): Bucket {
    if (this.bucketCache) return this.bucketCache;
    const name = this.configService.get<string>('GCS_BUCKET');
    if (!name?.trim()) {
      throw new InternalServerErrorException(
        'GCS_BUCKET is required for storage operations',
      );
    }
    this.bucketCache = this.client().bucket(name);
    return this.bucketCache;
  }

  private client(): Storage {
    if (this.storage) return this.storage;
    const projectId = this.configService.get<string>('GCP_PROJECT_ID');
    const base64 = this.configService.get<string>(
      'GCS_CREDENTIALS_JSON_BASE64',
    );

    if (base64?.trim()) {
      const credentials = JSON.parse(
        Buffer.from(base64, 'base64').toString('utf-8'),
      ) as Record<string, unknown>;
      this.storage = new Storage({ projectId, credentials });
    } else {
      this.storage = new Storage({ projectId });
    }
    return this.storage;
  }

  private getDefaultExpiry(): number {
    return this.configService.get<number>('GCS_PRESIGN_EXPIRES') ?? 900;
  }
}
