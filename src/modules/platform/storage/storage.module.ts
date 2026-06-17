import { Global, Module } from '@nestjs/common';
import { CachedStorageService } from './services/cached-storage.service';
import { GcsStorageService } from './services/gcs-storage.service';
import { MediaCleanupService } from './services/media-cleanup.service';
import { STORAGE_SERVICE } from './interfaces/storage.types';
import {
  MEDIA_CLEANUP_OPTIONS,
  type MediaCleanupOptions,
} from './interfaces/media-cleanup-options.interface';
import { MEDIA_REFERENCE_PROVIDERS } from './interfaces/media-reference-provider.interface';

/**
 * Generic object-storage platform module.
 *
 * - `STORAGE_SERVICE` resolves to the Redis-cached decorator over the GCS
 *   reference implementation. Swap `GcsStorageService` for another backend
 *   here to retarget without touching consumers.
 * - `MediaCleanupService` runs a scheduled orphan sweep. It ships DORMANT: the
 *   default `MEDIA_CLEANUP_OPTIONS` has no prefixes (sweep no-ops) and the
 *   default `MEDIA_REFERENCE_PROVIDERS` is empty. A consuming app overrides
 *   these providers (e.g. in its own module) to opt in and feed referenced keys.
 */
@Global()
@Module({
  providers: [
    GcsStorageService,
    CachedStorageService,
    MediaCleanupService,
    {
      provide: STORAGE_SERVICE,
      useExisting: CachedStorageService,
    },
    {
      provide: MEDIA_CLEANUP_OPTIONS,
      useValue: { prefixes: [] } satisfies MediaCleanupOptions,
    },
    {
      provide: MEDIA_REFERENCE_PROVIDERS,
      useValue: [],
    },
  ],
  exports: [STORAGE_SERVICE, MediaCleanupService],
})
export class StorageModule {}
