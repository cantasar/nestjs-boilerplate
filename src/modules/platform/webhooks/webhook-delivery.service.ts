import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queue/constants/queue.constants';
import {
  WEBHOOK_DELIVERY_CHUNK_SIZE,
  WEBHOOK_RESERVED_META_KEYS,
} from './constants/webhook.constants';
import type { WebhookEndpoint } from './interfaces/webhook-endpoint.interface';
import {
  WEBHOOK_DELIVERY_JOB,
  type WebhookDeliveryJob,
} from './queue/webhook-delivery.types';

/**
 * Splits a batch into chunks and queues one job per chunk. Does nothing when
 * the URL env var is unset, since webhooks are optional.
 */
@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.WEBHOOK_DELIVERY)
    private readonly queue: Queue<WebhookDeliveryJob>,
    private readonly config: ConfigService,
  ) {}

  /** `meta` goes on every chunk so the receiver can dedupe the batch. */
  async deliver(
    endpoint: WebhookEndpoint,
    items: unknown[], // caller-owned JSON-serializable payload
    meta?: Record<string, string>,
    chunkSize: number = WEBHOOK_DELIVERY_CHUNK_SIZE,
  ): Promise<void> {
    const url = this.config.get<string>(endpoint.urlEnvVar);
    if (!url) {
      this.logger.debug(
        `${endpoint.urlEnvVar} unset — skipping webhook delivery`,
      );
      return;
    }
    if (items.length === 0) return;
    // `meta` is merged into the body, so it must not overwrite chunk fields.
    for (const reserved of WEBHOOK_RESERVED_META_KEYS) {
      if (meta && reserved in meta) {
        throw new Error(
          `meta.${reserved} shadows an envelope field — rename it`,
        );
      }
    }

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

  private chunk(
    items: unknown[], // caller-owned payload passthrough
    size: number,
  ): unknown[][] {
    // size <= 0 would be an infinite loop (i += 0); NaN would emit one empty
    // chunk. Clamp to a sane positive integer instead.
    const step = Math.max(1, Math.floor(Number.isFinite(size) ? size : 1));
    const out: unknown[][] = [];
    for (let i = 0; i < items.length; i += step) {
      out.push(items.slice(i, i + step));
    }
    return out;
  }
}
