import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.tokens';

@Injectable()
export class RedisService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /**
   * BullMQ needs `noeviction`, or Redis can silently drop jobs under memory
   * pressure. Not awaited on purpose: if Redis is down, it would stall startup.
   */
  onApplicationBootstrap(): void {
    void this.enforceNoEviction();
  }

  // Best effort: managed Redis may block CONFIG SET, so we only log a warning.
  private async enforceNoEviction(): Promise<void> {
    try {
      await this.client.config('SET', 'maxmemory-policy', 'noeviction');
    } catch (err) {
      this.logger.warn(
        `Could not set Redis maxmemory-policy=noeviction (set it on the provider): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setWithExpirySeconds(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /** INCR and EXPIRE run in one Lua script, so a crash can't leave a counter with no TTL. */
  async incrWithTtlSeconds(key: string, ttlSeconds: number): Promise<number> {
    const result = await this.client.eval(
      "local v = redis.call('INCR', KEYS[1]); if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return v",
      1,
      key,
      String(ttlSeconds),
    );
    return Number(result);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  /** SET NX with a TTL. Returns a token, or null when the lock is already held. */
  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  }
}
