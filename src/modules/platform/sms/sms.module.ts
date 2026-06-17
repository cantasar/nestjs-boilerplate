import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue/constants/queue.constants';
import { HttpSmsSender } from './services/http-sms-sender.service';
import { SMS_SENDER } from './interfaces/sms-sender.interface';
import { SmsQueueService } from './queue/sms-queue.service';
import { SmsProcessor } from './queue/sms.processor';

/**
 * SMS platform module. `SMS_SENDER` resolves to the generic HTTP sender; bind a
 * different class to the token here to swap providers. Sends go through the SMS
 * queue (producer `SmsQueueService` + worker `SmsProcessor`) so they leave the
 * request path and retry on failure.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SMS })],
  providers: [
    { provide: SMS_SENDER, useClass: HttpSmsSender },
    SmsQueueService,
    SmsProcessor,
  ],
  exports: [SMS_SENDER, SmsQueueService],
})
export class SmsModule {}
