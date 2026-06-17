import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  DEFAULT_QUEUE_CONCURRENCY,
  QUEUE_NAMES,
} from '../constants/queue.constants';
import { ExampleJob } from './example-queue.types';

/**
 * Concurrency is read at class-decoration time (before DI), so it comes from
 * `process.env` rather than ConfigService. Falls back to the shared default.
 */
const CONCURRENCY = Math.max(
  1,
  Number(process.env.QUEUE_CONCURRENCY ?? DEFAULT_QUEUE_CONCURRENCY),
);

/**
 * Reference worker for the generic queue infrastructure. Extend WorkerHost and
 * implement `process()`; the base auto-registers the worker after module init.
 *
 * Graceful drain: `@nestjs/bullmq` already closes workers on shutdown, but we
 * call `worker.close()` explicitly in `onApplicationShutdown` so in-flight jobs
 * finish (no new jobs are picked up) — `app.enableShutdownHooks()` in main.ts
 * triggers this.
 */
@Processor(QUEUE_NAMES.EXAMPLE, { concurrency: CONCURRENCY })
export class ExampleProcessor
  extends WorkerHost
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(ExampleProcessor.name);

  // void-ok: WorkerHost.process resolves with nothing for fire-and-forget jobs.
  async process(job: Job<ExampleJob>): Promise<void> {
    this.logger.debug(`Processing example job ${job.id}: ${job.data.message}`);
    await Promise.resolve();
  }

  // void-ok: drain returns nothing once the worker has closed.
  async onApplicationShutdown(): Promise<void> {
    if (!this.worker.isRunning()) return;
    await this.worker.close();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ExampleJob>, err: Error): void {
    const attempts = job.opts.attempts ?? 1;
    this.logger.error(
      `Example job ${job.id} failed (attempt ${job.attemptsMade}/${attempts}): ${err.message}`,
    );
  }
}
