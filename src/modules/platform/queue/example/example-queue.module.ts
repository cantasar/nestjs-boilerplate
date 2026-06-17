import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../constants/queue.constants';
import { ExampleProcessor } from './example.processor';
import { ExampleQueueService } from './example-queue.service';

/**
 * Reference feature-queue module. It only `registerQueue`s its own queue (the
 * connection is inherited from the global QueueModule root) and provides a
 * producer service plus a worker. Copy this shape for real feature queues.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.EXAMPLE })],
  providers: [ExampleQueueService, ExampleProcessor],
  exports: [ExampleQueueService],
})
export class ExampleQueueModule {}
