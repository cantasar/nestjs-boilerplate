import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  DEFAULT_QUEUE_CONCURRENCY,
  QUEUE_NAMES,
} from '../../queue/constants/queue.constants';
import { MediaAssetRepository } from '../media-asset.repository';
import { MediaProcessingService } from '../services/media-processing.service';
import { MediaProcessingJob } from './media-processing.types';

/**
 * Concurrency is read at class-decoration time (before DI), so it comes from
 * `process.env` rather than ConfigService. CPU-bound Sharp resize is kept at low
 * concurrency so it does not starve the event loop / saturate the box.
 */
const CONCURRENCY = Math.max(
  1,
  Number(process.env.MEDIA_QUEUE_CONCURRENCY ?? DEFAULT_QUEUE_CONCURRENCY),
);

@Processor(QUEUE_NAMES.MEDIA_PROCESSING, { concurrency: CONCURRENCY })
export class MediaProcessingProcessor
  extends WorkerHost
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(MediaProcessingProcessor.name);

  constructor(
    private readonly repository: MediaAssetRepository,
    private readonly processing: MediaProcessingService,
  ) {
    super();
  }

  // void-ok: fire-and-forget variant generation; nothing to return.
  async process(job: Job<MediaProcessingJob>): Promise<void> {
    const asset = await this.repository.findById(job.data.assetId);
    if (!asset) {
      this.logger.warn(
        `Media asset ${job.data.assetId} not found; skipping processing`,
      );
      return;
    }
    await this.processing.ensureProcessed(asset);
  }

  // void-ok: drain returns nothing once the worker has closed.
  async onApplicationShutdown(): Promise<void> {
    if (!this.worker.isRunning()) return;
    await this.worker.close();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MediaProcessingJob> | undefined, err: Error): void {
    if (!job) {
      this.logger.error(`Media processing job failed (no job): ${err.message}`);
      return;
    }
    const attempts = job.opts.attempts ?? 1;
    this.logger.error(
      `Media processing job ${job.id} (asset=${job.data.assetId}) failed (attempt ${job.attemptsMade}/${attempts}): ${err.message}`,
    );
  }
}
