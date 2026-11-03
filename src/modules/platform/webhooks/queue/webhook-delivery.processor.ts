import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import {
  DEFAULT_QUEUE_CONCURRENCY,
  QUEUE_NAMES,
} from '../../queue/constants/queue.constants';
import {
  WEBHOOK_DELIVERY_TIMEOUT_MS,
  WEBHOOK_SIGNATURE_HEADER,
} from '../constants/webhook.constants';
import { signWebhookBody } from '../lib/webhook-signature.util';
import type { WebhookDeliveryJob } from './webhook-delivery.types';

/**
 * Read from `process.env` because the decorator runs before DI. With only one
 * worker slot, a slow receiver would block every other chunk.
 */
const CONCURRENCY = Math.max(
  1,
  Number(process.env.QUEUE_CONCURRENCY ?? DEFAULT_QUEUE_CONCURRENCY),
);

/**
 * Signs and POSTs one chunk. Failed sends are retried, so delivery is
 * at-least-once and receivers must dedupe.
 */
@Processor(QUEUE_NAMES.WEBHOOK_DELIVERY, { concurrency: CONCURRENCY })
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    const { endpoint, chunkIndex, chunkCount, items, meta } = job.data;

    const url = this.config.get<string>(endpoint.urlEnvVar);
    if (!url) {
      // URL was unset by the time the job ran — drop it, do not retry.
      this.logger.warn(
        `${endpoint.urlEnvVar} unset; dropping webhook chunk ${chunkIndex}`,
      );
      return;
    }
    const secret = this.config.get<string>(endpoint.secretEnvVar)?.trim();
    if (!secret) {
      // Never send an unsigned payload; the receiver could not trust it.
      this.logger.error(
        `${endpoint.secretEnvVar} unset; refusing to send unsigned webhook chunk ${chunkIndex}`,
      );
      return;
    }

    const body = JSON.stringify({
      ...(meta ?? {}),
      chunkIndex,
      chunkCount,
      items,
    });
    const signature = signWebhookBody(secret, body);
    const header = endpoint.signatureHeader ?? WEBHOOK_SIGNATURE_HEADER;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [header]: signature,
      },
      body,
      // Don't let a hung receiver hold a worker slot for undici's 300s default.
      signal: AbortSignal.timeout(WEBHOOK_DELIVERY_TIMEOUT_MS),
      // Don't follow redirects; they could send the signed body to another host.
      redirect: 'error',
    });
    // Read the body so undici can reuse the connection.
    await response.text().catch(() => '');

    if (!response.ok) {
      const failure = `Webhook POST failed: ${response.status} ${response.statusText}`;
      // Retrying most 4xx errors won't help (408 and 429 are the exceptions).
      // UnrecoverableError makes BullMQ fail the job without retrying.
      const retryable =
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 429;
      if (!retryable) throw new UnrecoverableError(failure);
      throw new Error(failure);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookDeliveryJob> | undefined, err: Error): void {
    // Non-job failures (e.g. connection errors) deliver job=undefined.
    if (!job) {
      this.logger.error(`Webhook worker failure: ${err.message}`);
      return;
    }
    const attempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= attempts;
    const msg = `Webhook chunk ${job.data.chunkIndex + 1}/${job.data.chunkCount} failed (attempt ${job.attemptsMade}/${attempts}): ${err.message}`;
    if (exhausted) this.logger.error(`${msg} — dropped`);
    else this.logger.warn(msg);
  }
}
