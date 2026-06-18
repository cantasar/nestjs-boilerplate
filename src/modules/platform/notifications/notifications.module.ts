import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue/constants/queue.constants';
import { NotificationRepository } from './inbox/notification.repository';
import { NotificationService } from './inbox/notification.service';
import { OneSignalPushSender } from './push/one-signal-push.sender';
import { NotificationQueueService } from './queue/notification-queue.service';
import { NotificationBroadcastProcessor } from './queue/notification-broadcast.processor';
import { NotificationController } from './notification.controller';
import { NotificationListener } from './listeners/notification.listener';
import { NOTIFICATION_PORT } from './interfaces/notification-port.interface';
import { PUSH_SENDER } from './interfaces/push-sender.interface';

/**
 * Generic notifications platform module.
 *
 * - `NOTIFICATION_PORT` resolves to the Drizzle-backed `NotificationService`;
 *   bind a different class to the token to swap the inbox backend.
 * - `PUSH_SENDER` resolves to the OneSignal reference sender; bind another class
 *   to retarget the push provider without touching callers. It ships DORMANT —
 *   with `ONESIGNAL_APP_ID`/`ONESIGNAL_REST_API_KEY` unset every push no-ops.
 * - Bulk fan-out goes through the notification-broadcast queue (producer
 *   `NotificationQueueService` + worker `NotificationBroadcastProcessor`); the
 *   push provider is NEVER called synchronously on the request path.
 *
 * The app-wide BullMQ root lives in `platform/queue/QueueModule`; here we only
 * register this module's queue.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATION_BROADCAST }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationRepository,
    NotificationService,
    { provide: NOTIFICATION_PORT, useExisting: NotificationService },
    { provide: PUSH_SENDER, useClass: OneSignalPushSender },
    NotificationQueueService,
    NotificationBroadcastProcessor,
    NotificationListener,
  ],
  exports: [NOTIFICATION_PORT, PUSH_SENDER, NotificationQueueService],
})
export class NotificationsModule {}
