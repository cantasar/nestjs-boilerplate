import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import {
  DEFAULT_QUEUE_CONCURRENCY,
  QUEUE_NAMES,
} from '../../queue/constants/queue.constants';
import { RedisService } from '../../../shared/redis/redis.service';
import { SMS_SENDER, type SmsSender } from '../interfaces/sms-sender.interface';
import { SmsOtpJob } from './sms-queue.types';

/**
 * Concurrency is read at class-decoration time (before DI), so it comes from
 * `process.env` rather than ConfigService.
 */
const CONCURRENCY = Math.max(
  1,
  Number(process.env.QUEUE_CONCURRENCY ?? DEFAULT_QUEUE_CONCURRENCY),
);

// Best-effort idempotency window: a job re-delivered after a successful send is
// skipped instead of re-sending. Marker is set AFTER success so a real failure
// still retries.
const SMS_DEDUP_TTL_SECONDS = 900;

const DEFAULT_OTP_TEMPLATE = 'Your code: {otp}';

@Processor(QUEUE_NAMES.SMS, { concurrency: CONCURRENCY })
export class SmsProcessor extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    @Inject(SMS_SENDER) private readonly sender: SmsSender,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  // void-ok: WorkerHost.process resolves with nothing for fire-and-forget jobs.
  async process(job: Job<SmsOtpJob>): Promise<void> {
    const { to, otp } = job.data;
    const dedupKey = `sms:sent:${to}:${otp}`;
    if (await this.redis.get(dedupKey)) {
      this.logger.debug(`SMS to ${to} already sent; skipping duplicate`);
      return;
    }
    const template =
      this.config.get<string>('SMS_OTP_TEMPLATE') ?? DEFAULT_OTP_TEMPLATE;
    await this.sender.send(to, template.replaceAll('{otp}', otp));
    await this.redis.setWithExpirySeconds(dedupKey, '1', SMS_DEDUP_TTL_SECONDS);
  }

  // void-ok: drain returns nothing once the worker has closed.
  async onApplicationShutdown(): Promise<void> {
    if (!this.worker.isRunning()) return;
    await this.worker.close();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SmsOtpJob>, err: Error): void {
    const attempts = job.opts.attempts ?? 1;
    this.logger.error(
      `SMS job ${job.id} failed (attempt ${job.attemptsMade}/${attempts}): ${err.message}`,
    );
  }
}
