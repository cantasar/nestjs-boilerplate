import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue/constants/queue.constants';
import { MediaController } from './media.controller';
import { MediaAssetRepository } from './media-asset.repository';
import { MediaAssetService } from './services/media-asset.service';
import { MediaProcessingService } from './services/media-processing.service';
import { MediaProcessingQueueService } from './queue/media-processing-queue.service';
import { MediaProcessingProcessor } from './queue/media-processing.processor';
import { ASSET_PORT } from './interfaces/asset-port.interface';

/**
 * Generic media platform module.
 *
 * - `ASSET_PORT` resolves to the Drizzle + storage-backed `MediaAssetService`;
 *   bind a different class to the token to swap the backend without touching
 *   callers. Asset-to-entity binding is a free-form `(type, id)` pair — no
 *   domain tables are referenced.
 * - Variant generation (resize/thumbnail) runs off the request path via the
 *   media-processing queue (producer `MediaProcessingQueueService` + worker
 *   `MediaProcessingProcessor`). `sharp` is an OPTIONAL dependency loaded
 *   lazily; absent it, processing no-ops and originals stay usable.
 *
 * The app-wide BullMQ root lives in `platform/queue/QueueModule`; here we only
 * register this module's queue. Storage is provided globally by StorageModule
 * (`STORAGE_SERVICE`).
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.MEDIA_PROCESSING })],
  controllers: [MediaController],
  providers: [
    MediaAssetRepository,
    MediaAssetService,
    { provide: ASSET_PORT, useExisting: MediaAssetService },
    MediaProcessingService,
    MediaProcessingQueueService,
    MediaProcessingProcessor,
  ],
  exports: [ASSET_PORT, MediaProcessingQueueService],
})
export class MediaModule {}
