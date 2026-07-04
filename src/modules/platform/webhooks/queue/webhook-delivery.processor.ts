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
 * Concurrency is read at class-decoration time (before DI), so it comes from
 * `process.env` rather than ConfigService. Without it the worker runs
 * concurrency=1 and a single slow receiver head-of-line-blocks every chunk.
 */
const CONCURRENCY = Math.max(
  1,
  Number(process.env.QUEUE_CONCURRENCY ?? DEFAULT_QUEUE_CONCURRENCY),
);

/**
 * Delivers one chunk to the configured receiver: serialize the envelope, sign
 * the EXACT bytes with HMAC-SHA256, POST with the signature header. A non-2xx
 * response or network error throws, so BullMQ retries with backoff
 * (at-least-once — receivers must dedupe/upsert). Deterministic client errors
 * (4xx except 408/429) fail WITHOUT retry — resending an unprocessable payload
 * five times only delays the real failure signal.
 *
 * REFUSE-UNSIGNED: if the secret env var is unset the chunk is dropped with an
 * error log — an unsigned payload is unverifiable and must never ship.
 */
@Processor(QUEUE_NAMES.WEBHOOK_DELIVERY, { concurrency: CONCURRENCY })
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
      // A receiver that accepts TCP but never responds must not pin a worker
      // slot for undici's 300s default — abort and let BullMQ retry.
      signal: AbortSignal.timeout(WEBHOOK_DELIVERY_TIMEOUT_MS),
      // A 3xx would turn the POST into a GET and replay the signed body (and
      // signature header) at a third host. Webhook delivery never follows.
      redirect: 'error',
    });
    // Consume the body so undici can reuse the connection instead of holding
    // it until GC.
    await response.text().catch(() => '');

    if (!response.ok) {
      const failure = `Webhook POST failed: ${response.status} ${response.statusText}`;
      // Deterministic client errors won't heal with retries (408/429 are the
      // transient exceptions). UnrecoverableError → BullMQ fails immediately.
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
