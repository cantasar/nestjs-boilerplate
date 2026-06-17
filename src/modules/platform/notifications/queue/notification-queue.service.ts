import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/constants/queue.constants';
import { buildJobOptions } from '../../queue/utils/job-options.util';
import {
  BROADCAST_CHUNK_JOB,
  type BroadcastChunkJob,
} from './notification-broadcast.types';
import type { NotificationType } from '../../../shared/database/schema/enums/notification-type.enum';
import type {
  BroadcastRecipient,
  LocalizedCopy,
} from '../interfaces/notification.types';

const DEFAULT_CHUNK_SIZE = 500;

/** Parameters for enqueuing a broadcast fan-out (chunked off the request path). */
export interface EnqueueBroadcastParams {
  broadcastId?: string | null;
  type: NotificationType;
  recipients: BroadcastRecipient[];
  title: LocalizedCopy;
  body: LocalizedCopy;
  deepLink?: string;
  iconUrl?: string;
  payload?: Record<string, unknown>;
}

/**
 * Producer for the notification-broadcast queue. A consuming app calls
 * `enqueueBroadcast` with the resolved recipient list + localized copy; this
 * splits it into bounded chunks and adds one job per chunk. Fan-out NEVER calls
 * the push provider synchronously — the worker does that per chunk, so an admin
 * request returns immediately and each chunk retries independently.
 */
@Injectable()
export class NotificationQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_BROADCAST)
    private readonly queue: Queue<BroadcastChunkJob>,
    private readonly config: ConfigService,
  ) {}

  async enqueueBroadcast(
    params: EnqueueBroadcastParams,
  ): Promise<{ enqueued: number; totalRecipients: number }> {
    const { recipients } = params;
    if (recipients.length === 0) return { enqueued: 0, totalRecipients: 0 };

    const chunkSize =
      this.config.get<number>('NOTIFICATION_BROADCAST_CHUNK_SIZE') ??
      DEFAULT_CHUNK_SIZE;
    const opts = buildJobOptions({
      attempts: this.config.get<number>('QUEUE_DEFAULT_ATTEMPTS') ?? 3,
      backoffMs: this.config.get<number>('QUEUE_DEFAULT_BACKOFF_MS') ?? 1000,
    });

    // Always carry a broadcastId: it keys the worker's per-recipient dedup so a
    // chunk retry can't double-insert inbox rows. Generated when the caller
    // didn't supply one.
    const broadcastId = params.broadcastId ?? randomUUID();
    const jobs: { name: string; data: BroadcastChunkJob; opts: typeof opts }[] =
      [];
    for (let i = 0; i < recipients.length; i += chunkSize) {
      jobs.push({
        name: BROADCAST_CHUNK_JOB,
        data: {
          broadcastId,
          type: params.type,
          recipients: recipients.slice(i, i + chunkSize),
          title: params.title,
          body: params.body,
          deepLink: params.deepLink,
          iconUrl: params.iconUrl,
          payload: params.payload,
        },
        opts,
      });
    }

    await this.queue.addBulk(jobs);
    return { enqueued: jobs.length, totalRecipients: recipients.length };
  }
}
