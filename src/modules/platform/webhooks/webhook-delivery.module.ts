import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue/constants/queue.constants';
import {
  WEBHOOK_DELIVERY_ATTEMPTS,
  WEBHOOK_DELIVERY_BACKOFF_MS,
} from './constants/webhook.constants';
import { WebhookDeliveryProcessor } from './queue/webhook-delivery.processor';
import { WebhookDeliveryService } from './webhook-delivery.service';

/**
 * Generic signed webhook delivery: chunked fan-out (service) + HMAC-signed
 * POST with retry/backoff (processor). Import this module and call
 * `WebhookDeliveryService.deliver(endpoint, items, meta)` with your feature's
 * endpoint env-var names — one module serves any number of integrations.
 *
 * Delivery is at-least-once (retried on non-2xx); receivers must upsert/dedupe
 * (see docs/patterns/webhook-delivery.md for the receiver contract).
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.WEBHOOK_DELIVERY,
      defaultJobOptions: {
        attempts: WEBHOOK_DELIVERY_ATTEMPTS,
        backoff: { type: 'exponential', delay: WEBHOOK_DELIVERY_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }),
  ],
  providers: [WebhookDeliveryService, WebhookDeliveryProcessor],
  exports: [WebhookDeliveryService],
})
export class WebhookDeliveryModule {}
