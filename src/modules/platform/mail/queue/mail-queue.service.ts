import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/constants/queue.constants';
import { buildJobOptions } from '../../queue/utils/job-options.util';
import { MailJob } from './mail-queue.types';

/** Queues mail so it is sent off the request path. */
@Injectable()
export class MailQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.MAIL) private readonly queue: Queue<MailJob>,
    private readonly config: ConfigService,
  ) {}

  async enqueue(job: MailJob): Promise<void> {
    await this.queue.add(
      job.template,
      job,
      buildJobOptions({
        attempts: this.config.get<number>('QUEUE_DEFAULT_ATTEMPTS') ?? 3,
        backoffMs: this.config.get<number>('QUEUE_DEFAULT_BACKOFF_MS') ?? 1000,
      }),
    );
  }
}
