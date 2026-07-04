import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queue/constants/queue.constants';
import { WEBHOOK_DELIVERY_CHUNK_SIZE } from './constants/webhook.constants';
import type { WebhookEndpoint } from './interfaces/webhook-endpoint.interface';
import {
  WEBHOOK_DELIVERY_JOB,
  type WebhookDeliveryJob,
} from './queue/webhook-delivery.types';

/**
 * Producer half of signed webhook delivery: chunks a batch and enqueues one
 * BullMQ job per chunk. NO-OP when the endpoint's URL env var is unset —
 * webhook push is an optional integration, not a hard dependency (the
 * best-effort / no-op-when-unconfigured pattern). The processor does the
 * signed POST + retry; this service only fans out the work.
 */
@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.WEBHOOK_DELIVERY)
    private readonly queue: Queue<WebhookDeliveryJob>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Split `items` into chunks and enqueue a delivery job for each. `meta`
   * (e.g. a batch `generatedAt`) is repeated on every chunk's envelope so the
   * receiver can version/dedupe the whole batch consistently.
   */
  async deliver(
    endpoint: WebhookEndpoint,
    items: unknown[], // boundary: validated — caller-owned JSON-serializable payload
    meta?: Record<string, string>,
    chunkSize: number = WEBHOOK_DELIVERY_CHUNK_SIZE,
  ): Promise<void> {
    // void-ok: enqueue acknowledges by resolving once all chunks are added.
    const url = this.config.get<string>(endpoint.urlEnvVar);
    if (!url) {
      this.logger.debug(
        `${endpoint.urlEnvVar} unset — skipping webhook delivery`,
      );
      return;
    }
    if (items.length === 0) return;

    const chunks = this.chunk(items, chunkSize);
    for (const [chunkIndex, chunkItems] of chunks.entries()) {
      await this.queue.add(WEBHOOK_DELIVERY_JOB, {
        endpoint,
        chunkIndex,
        chunkCount: chunks.length,
        items: chunkItems,
        ...(meta ? { meta } : {}),
      });
    }
    this.logger.log(
      `Enqueued ${chunks.length} webhook chunk(s) for ${items.length} item(s) → ${endpoint.urlEnvVar}`,
    );
  }

  private chunk(items: unknown[], size: number): unknown[][] {
    const out: unknown[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  }
}
