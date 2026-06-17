import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/constants/queue.constants';
import { buildJobOptions } from '../../queue/utils/job-options.util';
import {
  MEDIA_PROCESS_JOB,
  MediaProcessingJob,
} from './media-processing.types';

/**
 * Producer for the media-processing queue. CPU-bound variant generation (resize
 * / thumbnail) runs off the request path on the worker. `jobId: media:<id>`
 * dedupes: a second enqueue for the same asset while one is queued/active is a
 * no-op, and the worker itself no-ops once the asset is already processed.
 */
@Injectable()
export class MediaProcessingQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.MEDIA_PROCESSING)
    private readonly queue: Queue<MediaProcessingJob>,
    private readonly config: ConfigService,
  ) {}

  // void-ok: resolves once the job is added.
  async enqueue(assetId: number): Promise<void> {
    await this.queue.add(
      MEDIA_PROCESS_JOB,
      { assetId },
      {
        jobId: `media:${assetId}`,
        ...buildJobOptions({
          attempts: this.config.get<number>('QUEUE_DEFAULT_ATTEMPTS') ?? 3,
          backoffMs:
            this.config.get<number>('QUEUE_DEFAULT_BACKOFF_MS') ?? 1000,
        }),
      },
    );
  }
}
