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
 * Signed webhook delivery: call `WebhookDeliveryService.deliver()` with your
 * endpoint. Delivery is at-least-once, so receivers must dedupe.
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
