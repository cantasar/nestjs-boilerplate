import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/constants/queue.constants';
import { WEBHOOK_SIGNATURE_HEADER } from '../constants/webhook.constants';
import { signWebhookBody } from '../lib/webhook-signature.util';
import type { WebhookDeliveryJob } from './webhook-delivery.types';

/**
 * Delivers one chunk to the configured receiver: serialize the envelope, sign
 * the EXACT bytes with HMAC-SHA256, POST with the signature header. A non-2xx
 * response or network error throws, so BullMQ retries with backoff
 * (at-least-once — receivers must dedupe/upsert).
 *
 * REFUSE-UNSIGNED: if the secret env var is unset the chunk is dropped with an
 * error log — an unsigned payload is unverifiable and must never ship.
 */
@Processor(QUEUE_NAMES.WEBHOOK_DELIVERY)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  // void-ok: worker body — delivery acknowledged by resolving.
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
      // Never emit an unsigned (or ''-signed) payload — a receiver can't
      // trust it. Drop the chunk instead of shipping data unverifiable.
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
    });
    if (!response.ok) {
      throw new Error(
        `Webhook POST failed: ${response.status} ${response.statusText}`,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookDeliveryJob>, err: Error): void {
    const attempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= attempts;
    const msg = `Webhook chunk ${job.data.chunkIndex + 1}/${job.data.chunkCount} failed (attempt ${job.attemptsMade}/${attempts}): ${err.message}`;
    if (exhausted) this.logger.error(`${msg} — dropped`);
    else this.logger.warn(msg);
  }
}
