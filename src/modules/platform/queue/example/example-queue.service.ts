import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../constants/queue.constants';
import { buildJobOptions } from '../utils/job-options.util';
import { EXAMPLE_JOB, ExampleJob } from './example-queue.types';

/**
 * Reference producer: injects the queue by name and enqueues jobs with the
 * shared default options. Copy this shape for real feature queues.
 */
@Injectable()
export class ExampleQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.EXAMPLE) private readonly queue: Queue<ExampleJob>,
    private readonly config: ConfigService,
  ) {}

  // void-ok: enqueue acknowledges by resolving once the job is added.
  async enqueue(job: ExampleJob): Promise<void> {
    await this.queue.add(
      EXAMPLE_JOB,
      job,
      buildJobOptions({
        attempts: this.config.get<number>('QUEUE_DEFAULT_ATTEMPTS') ?? 3,
        backoffMs: this.config.get<number>('QUEUE_DEFAULT_BACKOFF_MS') ?? 1000,
      }),
    );
  }
}
