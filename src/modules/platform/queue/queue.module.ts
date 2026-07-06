import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

/**
 * Parse a redis:// / rediss:// URL into ioredis options. BullMQ receives
 * OPTIONS (not a client instance) so it creates AND closes its own
 * connections in the right lifecycle order. Passing an instance looked tidy
 * but broke graceful shutdown: our onModuleDestroy quit the connection while
 * @nestjs/bullmq closes workers later in onApplicationShutdown — in-flight
 * jobs failed their ack against a dead connection and re-ran as stalled after
 * every deploy (duplicate mails/SMS/webhooks).
 */
function redisUrlToOptions(url: string): RedisOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.pathname && u.pathname !== '/'
      ? { db: Number(u.pathname.slice(1)) || 0 }
      : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    // Required by BullMQ for its blocking connections.
    maxRetriesPerRequest: null,
  };
}

/**
 * App-wide BullMQ root. Dedicated connection options (separate from the shared
 * cache/throttler REDIS_CLIENT) so the queues' blocking commands never starve
 * the cache workload.
 *
 * Each consuming feature module only does `BullModule.registerQueue({ name })`
 * (see platform/queue/example for the reference layout) — it inherits this
 * shared configuration. An optional QUEUE_PREFIX namespaces all keys when set.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const prefix = config.get<string>('QUEUE_PREFIX');
        return {
          connection: redisUrlToOptions(config.getOrThrow<string>('REDIS_URL')),
          ...(prefix ? { prefix } : {}),
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
