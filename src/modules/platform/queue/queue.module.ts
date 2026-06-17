import { BullModule } from '@nestjs/bullmq';
import { Global, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// The dedicated BullMQ connection is created in the forRoot factory; hold a
// reference so it can be closed on shutdown (BullMQ does not own/close a
// connection instance passed to it), avoiding a leak on teardown/test reboots.
let queueConnection: Redis | undefined;

/**
 * App-wide BullMQ root. A dedicated ioredis client (separate from the shared
 * cache/throttler REDIS_CLIENT) carries the queues' blocking commands so they
 * never starve the cache workload. `maxRetriesPerRequest: null` is required by
 * BullMQ for blocking connections.
 *
 * Each consuming feature module only does `BullModule.registerQueue({ name })`
 * (see platform/queue/example for the reference layout) — it inherits this
 * shared connection. An optional QUEUE_PREFIX namespaces all keys when set.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const prefix = config.get<string>('QUEUE_PREFIX');
        queueConnection = new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
        });
        return {
          connection: queueConnection,
          ...(prefix ? { prefix } : {}),
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule implements OnModuleDestroy {
  // void-ok: closes the dedicated BullMQ connection on shutdown.
  async onModuleDestroy(): Promise<void> {
    if (queueConnection) {
      await queueConnection.quit();
      queueConnection = undefined;
    }
  }
}
