import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  DEFAULT_QUEUE_CONCURRENCY,
  QUEUE_NAMES,
} from '../../queue/constants/queue.constants';
import { NotificationRepository } from '../inbox/notification.repository';
import {
  PUSH_SENDER,
  type PushSender,
} from '../interfaces/push-sender.interface';
import { PushDeliveryStatus } from '../../../shared/database/schema/enums/notification-type.enum';
import {
  type BroadcastChunkJob,
  type BroadcastChunkResult,
} from './notification-broadcast.types';
import type { NewNotification } from '../../../shared/database/types/notification-insert.type';
import type { LocalizedCopy } from '../interfaces/notification.types';

/**
 * Concurrency is read at class-decoration time (before DI), so it comes from
 * `process.env` rather than ConfigService.
 */
const CONCURRENCY = Math.max(
  1,
  Number(process.env.QUEUE_CONCURRENCY ?? DEFAULT_QUEUE_CONCURRENCY),
);

/**
 * Worker for the notification-broadcast queue. Per chunk it (A) persists one
 * inbox row per recipient, then (B) pushes to the chunk's external ids via the
 * `PUSH_SENDER` port. Push failure throws so BullMQ retries the whole chunk with
 * backoff; the inbox insert is the canonical record either way. This is the only
 * place bulk push happens — producers never call the provider synchronously.
 */
@Processor(QUEUE_NAMES.NOTIFICATION_BROADCAST, { concurrency: CONCURRENCY })
export class NotificationBroadcastProcessor
  extends WorkerHost
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationBroadcastProcessor.name);

  constructor(
    private readonly repo: NotificationRepository,
    @Inject(PUSH_SENDER) private readonly pushSender: PushSender,
  ) {
    super();
  }

  async process(job: Job<BroadcastChunkJob>): Promise<BroadcastChunkResult> {
    const data = job.data;

    // Phase A — inbox persistence (canonical record). Idempotent across retries:
    // skip recipients already persisted for this broadcast so a re-run never
    // double-inserts inbox rows.
    const rows: NewNotification[] = data.recipients.map((r) => ({
      recipientUserId: r.userId,
      type: data.type,
      title: this.pickCopy(data.title, r.locale),
      body: this.pickCopy(data.body, r.locale),
      deepLink: data.deepLink,
      iconUrl: data.iconUrl,
      payload: data.payload ?? {},
      broadcastId: data.broadcastId,
      pushDeliveryStatus: PushDeliveryStatus.PENDING,
    }));

    let toInsert = rows;
    const existingIds: number[] = [];
    if (data.broadcastId) {
      const recipientIds = data.recipients.map((r) => r.userId);
      const existing = await this.repo.findExistingByBroadcast(
        data.broadcastId,
        recipientIds,
      );
      const existingRecipients = new Set(
        existing.map((e) => e.recipientUserId),
      );
      existingIds.push(...existing.map((e) => e.id));
      toInsert = rows.filter((r) => !existingRecipients.has(r.recipientUserId));
    }
    const inserted = await this.repo.bulkInsert(toInsert);
    const insertedIds = [...existingIds, ...inserted.map((row) => row.id)];

    // Phase B — push to the targetable recipients only.
    const externalIds = data.recipients
      .map((r) => r.pushExternalId)
      .filter((id): id is string => Boolean(id));

    if (externalIds.length === 0) {
      await this.repo.markPushStatusByIds(
        insertedIds,
        PushDeliveryStatus.SKIPPED,
      );
      return { inserted: rows.length, pushed: false, recipients: 0 };
    }

    const result = await this.pushSender.sendToExternalIds({
      externalIds,
      title: data.title,
      body: data.body,
      url: data.deepLink,
      iconUrl: data.iconUrl,
      data: data.payload,
    });

    if (result.skipped) {
      await this.repo.markPushStatusByIds(
        insertedIds,
        PushDeliveryStatus.SKIPPED,
      );
      return { inserted: rows.length, pushed: false, recipients: 0 };
    }

    if (!result.delivered) {
      // Throw so BullMQ retries; statuses stay PENDING so a later attempt can
      // still mark them SENT rather than locking in FAILED prematurely.
      throw new Error(
        `Push failed for broadcast=${data.broadcastId ?? 'inline'}: ${result.error ?? 'unknown'}`,
      );
    }

    await this.repo.markPushStatusByIds(insertedIds, PushDeliveryStatus.SENT);
    return {
      inserted: rows.length,
      pushed: true,
      recipients: result.recipients ?? externalIds.length,
    };
  }

  // void-ok: drain returns nothing once the worker has closed.
  async onApplicationShutdown(): Promise<void> {
    if (!this.worker.isRunning()) return;
    await this.worker.close();
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<BroadcastChunkJob>, err: Error): Promise<void> {
    // void-ok
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    this.logger.error(
      `Broadcast chunk job ${job.id} failed (attempt ${job.attemptsMade}/${attempts}): ${err.message}`,
    );
    // Terminal failure (retries exhausted): flip the chunk's still-PENDING rows
    // to FAILED so they don't sit PENDING forever.
    if (job.attemptsMade >= attempts && job.data.broadcastId) {
      const recipientIds = job.data.recipients.map((r) => r.userId);
      await this.repo
        .markBroadcastPendingFailed(job.data.broadcastId, recipientIds)
        .catch((markErr: unknown) => {
          this.logger.error(
            `Failed to mark broadcast=${job.data.broadcastId} rows FAILED: ${
              markErr instanceof Error ? markErr.message : String(markErr)
            }`,
          );
        });
    }
  }

  /** Picks the recipient's locale copy, falling back to `default` then any value. */
  private pickCopy(copy: LocalizedCopy, locale: string): string {
    return (
      copy[locale] ?? copy.default ?? Object.values(copy).find(Boolean) ?? ''
    );
  }
}
