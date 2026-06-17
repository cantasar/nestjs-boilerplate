import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/constants/queue.constants';
import { buildJobOptions } from '../../queue/utils/job-options.util';
import { SMS_OTP_JOB, SmsOtpJob } from './sms-queue.types';

/**
 * Producer that enqueues SMS sends off the request path. Inherits the shared
 * BullMQ connection from the global QueueModule and the shared retention/backoff
 * defaults from `buildJobOptions`.
 */
@Injectable()
export class SmsQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.SMS) private readonly queue: Queue<SmsOtpJob>,
    private readonly config: ConfigService,
  ) {}

  // void-ok: enqueue resolves once the job is added.
  async enqueueOtp(job: SmsOtpJob): Promise<void> {
    await this.queue.add(
      SMS_OTP_JOB,
      job,
      buildJobOptions({
        attempts: this.config.get<number>('QUEUE_DEFAULT_ATTEMPTS') ?? 3,
        backoffMs: this.config.get<number>('QUEUE_DEFAULT_BACKOFF_MS') ?? 1000,
      }),
    );
  }
}
