import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue/constants/queue.constants';
import { MailService } from './mail.service';
import { MailQueueService } from './queue/mail-queue.service';
import { MailProcessor } from './queue/mail.processor';

/** Send mail via `MailQueueService.enqueue()` so it is queued and retried. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.MAIL })],
  providers: [MailService, MailQueueService, MailProcessor],
  exports: [MailService, MailQueueService],
})
export class MailModule {}
