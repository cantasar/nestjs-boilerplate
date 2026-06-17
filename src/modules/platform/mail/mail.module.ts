import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue/constants/queue.constants';
import { MailService } from './mail.service';
import { MailQueueService } from './queue/mail-queue.service';
import { MailProcessor } from './queue/mail.processor';

/**
 * Mail platform module. Sends go through the mail queue (producer
 * `MailQueueService` + worker `MailProcessor`) so they leave the request path
 * and retry on failure; `MailService` remains the transport. Callers enqueue via
 * `MailQueueService.enqueue(...)` instead of awaiting a synchronous send.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.MAIL })],
  providers: [MailService, MailQueueService, MailProcessor],
  exports: [MailService, MailQueueService],
})
export class MailModule {}
