import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'bullmq';

/**
 * Pass options, not a client, so BullMQ closes its own connections after the
 * workers stop. A shared client closes too early, so in-flight jobs re-run.
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
 * Global BullMQ setup with its own Redis connection, so blocking queue commands
 * never slow the cache. Feature modules only call `BullModule.registerQueue()`.
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
