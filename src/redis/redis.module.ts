import {
  Global,
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.tokens';
import { RedisService } from './redis.service';

/**
 * Closes Redis on application shutdown to avoid connection leaks.
 */
@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

/**
 * Global Redis module: single `ioredis` client from `REDIS_URL`.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        new Redis(config.getOrThrow<string>('REDIS_URL')),
    },
    RedisService,
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
