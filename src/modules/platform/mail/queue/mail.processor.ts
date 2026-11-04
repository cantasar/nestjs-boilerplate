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

/** Read from `process.env` because the decorator runs before DI. */
const CONCURRENCY = Math.max(
  1,
  Number(process.env.QUEUE_CONCURRENCY ?? DEFAULT_QUEUE_CONCURRENCY),
);

// Dedup window for OTP mail. The key is claimed before the send so duplicate
// jobs can't both send, and released on failure so retries still work.
const MAIL_DEDUP_TTL_SECONDS = 900;

/** Sends queued mail. A failed send throws, so BullMQ retries it. */
@Processor(QUEUE_NAMES.MAIL, { concurrency: CONCURRENCY })
export class MailProcessor extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mail: MailService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(job: Job<MailJob>): Promise<void> {
    const data = job.data;

    const dedupKey = `mail:sent:${data.template}:${data.to}:${data.code}`;
    const claimed = await this.redis.acquireLock(
      dedupKey,
      MAIL_DEDUP_TTL_SECONDS,
    );
    if (!claimed) {
      this.logger.debug(
        `Mail ${data.template} already sent; skipping duplicate`,
      );
      return;
    }

    try {
      await this.send(data);
    } catch (err) {
      // Release the claim so BullMQ's retry can re-send.
      await this.redis.del(dedupKey);
      throw err;
    }
  }

  /** Add a case here for each new `MailJob` template. */
  private async send(data: MailJob): Promise<void> {
    switch (data.template) {
      case 'verify-email':
        await this.mail.sendVerificationEmail(data.to, data.code);
        return;
      case 'password-reset':
        await this.mail.sendPasswordResetEmail(data.to, data.code);
        return;
    }
  }

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
