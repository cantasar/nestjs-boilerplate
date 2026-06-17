import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../shared/redis/redis.tokens';
import { GcsStorageService } from './gcs-storage.service';
import { PRESIGN_CACHE_PREFIX } from '../constants/storage.constants';
import type {
  PresignReadParams,
  PresignUploadParams,
  StorageService,
} from '../interfaces/storage.types';

const CACHE_MARGIN_SECONDS = 60;

/**
 * Caching decorator over the concrete storage service. Read presigns are cached
 * in Redis until shortly before they expire (signing is the costly call);
 * everything else delegates straight through. This is the class bound to the
 * `STORAGE_SERVICE` token, so consumers transparently get the cache.
 */
@Injectable()
export class CachedStorageService implements StorageService {
  constructor(
    private readonly inner: GcsStorageService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  presignUpload(params: PresignUploadParams): Promise<string> {
    return this.inner.presignUpload(params);
  }

  objectExists(key: string): Promise<boolean> {
    return this.inner.objectExists(key);
  }

  listObjects(prefix: string) {
    return this.inner.listObjects(prefix);
  }

  deleteObject(key: string): Promise<void> {
    // void-ok: delegates to the inner storage delete.
    return this.inner.deleteObject(key);
  }

  copyObject(srcKey: string, destKey: string): Promise<void> {
    // void-ok: delegates to the inner storage copy.
    return this.inner.copyObject(srcKey, destKey);
  }

  downloadObject(key: string): Promise<Buffer> {
    return this.inner.downloadObject(key);
  }

  uploadObject(
    key: string,
    body: Buffer,
    contentType: string,
    cacheControl?: string,
  ): Promise<void> {
    // void-ok: delegates to the inner storage upload.
    return this.inner.uploadObject(key, body, contentType, cacheControl);
  }

  async presignRead(params: PresignReadParams): Promise<string> {
    const ttl = this.cacheTtl(params.expiresIn);
    if (ttl <= 0) return this.inner.presignRead(params);

    const cacheKey = `${PRESIGN_CACHE_PREFIX}${params.key}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const url = await this.inner.presignRead(params);
    await this.redis.set(cacheKey, url, 'EX', ttl);
    return url;
  }

  async presignReadMany(
    keys: string[],
    expiresIn?: number,
  ): Promise<Map<string, string>> {
    const uniqueKeys = Array.from(new Set(keys));
    if (uniqueKeys.length === 0) return new Map();

    const ttl = this.cacheTtl(expiresIn);
    if (ttl <= 0) return this.inner.presignReadMany(uniqueKeys, expiresIn);

    const result = new Map<string, string>();
    const cacheKeys = uniqueKeys.map((k) => `${PRESIGN_CACHE_PREFIX}${k}`);
    const cached = await this.redis.mget(...cacheKeys);

    const missing: string[] = [];
    cached.forEach((value, idx) => {
      const key = uniqueKeys[idx]!;
      if (value) {
        result.set(key, value);
      } else {
        missing.push(key);
      }
    });

    if (missing.length === 0) return result;

    const fresh = await this.inner.presignReadMany(missing, expiresIn);

    if (fresh.size > 0) {
      const pipeline = this.redis.pipeline();
      fresh.forEach((url, key) => {
        pipeline.set(`${PRESIGN_CACHE_PREFIX}${key}`, url, 'EX', ttl);
      });
      await pipeline.exec();
    }

    fresh.forEach((url, key) => result.set(key, url));
    return result;
  }

  private cacheTtl(expiresIn?: number): number {
    const presignExpiry =
      expiresIn ?? this.configService.get<number>('GCS_PRESIGN_EXPIRES') ?? 900;
    return Math.max(0, presignExpiry - CACHE_MARGIN_SECONDS);
  }
}
