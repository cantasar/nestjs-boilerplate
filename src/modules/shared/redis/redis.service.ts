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
   * BullMQ requires `noeviction` — under any other maxmemory-policy Redis can
   * drop queue/job keys under memory pressure (silent job loss). Enforce it on
   * boot. Best-effort: managed providers may block CONFIG SET, in which case the
   * policy must be set in the provider dashboard.
   *
   * Fire-and-forget — MUST NOT block startup. If Redis is unreachable at cold
   * start the command sits in ioredis' offline queue and runs once connected;
   * awaiting it here would stall the Nest bootstrap (and the startup probe)
   * until the connection times out.
   */
  onApplicationBootstrap(): void {
    void this.enforceNoEviction();
  }

  // void-ok: best-effort config write, no result.
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
    // void-ok
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  /** Batch GET. Returns one entry per key, null where the key is missing. */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return this.client.mget(keys);
  }

  /** Cache-aside JSON read. Returns null when the key is missing or the stored
   *  value fails to parse (treated as a cache miss). */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** Cache-aside JSON write with TTL. */
  async setJson(
    key: string,
    value: unknown, // boundary: validated — arbitrary JSON-serializable value
    ttlSeconds: number,
  ): Promise<void> {
    // void-ok
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  /**
   * Atomic INCR that sets the TTL on the first increment in a single
   * round-trip. Prevents a crash between INCR and a separate EXPIRE from
   * leaving a counter that never resets (permanent rate-limit lockout).
   */
  async incrWithTtlSeconds(key: string, ttlSeconds: number): Promise<number> {
    const result = await this.client.eval(
      "local v = redis.call('INCR', KEYS[1]); if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return v",
      1,
      key,
      String(ttlSeconds),
    );
    return Number(result);
  }

  async hincrby(
    key: string,
    field: string,
    increment: number,
  ): Promise<number> {
    return this.client.hincrby(key, field, increment);
  }

  /** Pipelined HINCRBY of many fields on one hash — a single round-trip instead
   *  of one per field. */
  async hincrbyMany(
    key: string,
    fields: string[],
    increment = 1,
  ): Promise<void> {
    // void-ok
    if (fields.length === 0) return;
    const pipeline = this.client.pipeline();
    for (const field of fields) pipeline.hincrby(key, field, increment);
    await pipeline.exec();
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  /**
   * Atomic rename (buffer-swap primitive for metric-flush patterns). Returns
   * false ONLY when the source key does not exist (nothing to move). Any other
   * error (e.g. connection down) is rethrown so it surfaces instead of being
   * silently treated as an empty buffer.
   */
  async tryRename(source: string, destination: string): Promise<boolean> {
    try {
      await this.client.rename(source, destination);
      return true;
    } catch (err) {
      if (err instanceof Error && /no such key/i.test(err.message)) {
        return false;
      }
      throw err;
    }
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
