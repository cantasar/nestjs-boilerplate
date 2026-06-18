import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.tokens';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setWithExpirySeconds(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    // void-ok
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    return this.client.expire(key, ttlSeconds);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * Atomic SET-if-not-exists with TTL. Returns a unique fencing token if the
   * lock was acquired, or null if it is already held. Pass the token to
   * `releaseLock` so a holder can only delete its OWN lock — preventing the
   * classic "lock stolen after TTL, then the original holder deletes the new
   * holder's lock" race when a critical section overruns the TTL.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  }

  /**
   * Fenced release (compare-and-delete): deletes the lock only if `token`
   * still matches the stored value. A no-op if the lock expired and was
   * re-acquired by someone else.
   */
  async releaseLock(key: string, token: string): Promise<void> {
    // void-ok
    await this.client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token,
    );
  }
}
