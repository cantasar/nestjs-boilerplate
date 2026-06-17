import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  DEFAULT_QUEUE_CONCURRENCY,
  QUEUE_NAMES,
} from '../../queue/constants/queue.constants';
import { RedisService } from '../../../shared/redis/redis.service';
import { MailService } from '../mail.service';
import { MailJob } from './mail-queue.types';

/**
 * Concurrency is read at class-decoration time (before DI), so it comes from
 * `process.env` rather than ConfigService.
 */
const CONCURRENCY = Math.max(
  1,
  Number(process.env.QUEUE_CONCURRENCY ?? DEFAULT_QUEUE_CONCURRENCY),
);

// Best-effort idempotency window for OTP-bearing mail: a job re-delivered after
// a successful send is skipped. Marker set AFTER success so a real failure still
// retries.
const MAIL_DEDUP_TTL_SECONDS = 900;

/**
 * Sends mail off the request path. `MailService` throws on send failure, so a
 * failed job is retried by BullMQ with backoff. Extend the switch when adding a
 * new `MailJob` template arm.
 */
@Processor(QUEUE_NAMES.MAIL, { concurrency: CONCURRENCY })
export class MailProcessor extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mail: MailService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  // void-ok: WorkerHost.process resolves with nothing for fire-and-forget jobs.
  async process(job: Job<MailJob>): Promise<void> {
    const data = job.data;
    const dedupKey = `mail:sent:${data.template}:${data.to}:${data.otp}`;
    if (await this.redis.get(dedupKey)) {
      this.logger.debug(
        `Mail ${data.template} to ${data.to} already sent; skipping duplicate`,
      );
      return;
    }

    switch (data.template) {
      case 'otp':
        await this.mail.sendOtpEmail(data.to, data.otp);
        break;
    }

    await this.redis.setWithExpirySeconds(
      dedupKey,
      '1',
      MAIL_DEDUP_TTL_SECONDS,
    );
  }

  // void-ok: drain returns nothing once the worker has closed.
  async onApplicationShutdown(): Promise<void> {
    if (!this.worker.isRunning()) return;
    await this.worker.close();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MailJob>, err: Error): void {
    const attempts = job.opts.attempts ?? 1;
    this.logger.error(
      `Mail job ${job.id} (${job.data.template}) failed (attempt ${job.attemptsMade}/${attempts}): ${err.message}`,
    );
  }
}
