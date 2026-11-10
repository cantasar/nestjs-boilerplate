import { RedisService } from '../redis.service';
import type Redis from 'ioredis';

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  eval: jest.Mock;
  ping: jest.Mock;
  config: jest.Mock;
};

function makeClient(): MockRedis {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
    ping: jest.fn(),
    config: jest.fn(),
  };
}

function makeService(client: MockRedis): RedisService {
  return new RedisService(client as unknown as Redis);
}

describe('RedisService', () => {
  let client: MockRedis;
  let service: RedisService;

  beforeEach(() => {
    client = makeClient();
    service = makeService(client);
  });

  describe('get / setWithExpirySeconds / del', () => {
    it('reads a plain string value', async () => {
      client.get.mockResolvedValue('v');
      await expect(service.get('k')).resolves.toBe('v');
      expect(client.get).toHaveBeenCalledWith('k');
    });

    it('writes the value with an EX ttl in seconds', async () => {
      await service.setWithExpirySeconds('k', 'v', 60);
      expect(client.set).toHaveBeenCalledWith('k', 'v', 'EX', 60);
    });

    it('returns how many keys were deleted (0 means it was gone)', async () => {
      client.del.mockResolvedValue(0);
      await expect(service.del('k')).resolves.toBe(0);
      client.del.mockResolvedValue(1);
      await expect(service.del('k')).resolves.toBe(1);
    });
  });

  describe('incrWithTtlSeconds', () => {
    it('runs the atomic INCR+EXPIRE script and returns the counter', async () => {
      client.eval.mockResolvedValue(1);
      await expect(service.incrWithTtlSeconds('k', 30)).resolves.toBe(1);
      expect(client.eval).toHaveBeenCalledWith(
        expect.stringContaining('INCR'),
        1,
        'k',
        '30',
      );
    });

    it('sets the TTL only on the first increment, so a window never slides', async () => {
      client.eval.mockResolvedValue(2);
      await service.incrWithTtlSeconds('k', 30);
      const [script] = client.eval.mock.calls[0] as [string];
      expect(script).toMatch(/if v == 1 then redis\.call\('EXPIRE'/);
    });
  });

  describe('acquireLock', () => {
    it('uses SET NX EX and returns a random token when it wins', async () => {
      client.set.mockResolvedValue('OK');
      const first = await service.acquireLock('lock', 900);
      client.set.mockResolvedValue('OK');
      const second = await service.acquireLock('lock', 900);

      expect(client.set).toHaveBeenCalledWith(
        'lock',
        expect.any(String),
        'EX',
        900,
        'NX',
      );
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      expect(second).not.toBe(first);
    });

    it('returns null when the lock is already held', async () => {
      client.set.mockResolvedValue(null);
      await expect(service.acquireLock('lock', 900)).resolves.toBeNull();
    });
  });

  describe('ping', () => {
    it('passes PONG through for the health check', async () => {
      client.ping.mockResolvedValue('PONG');
      await expect(service.ping()).resolves.toBe('PONG');
    });
  });

  describe('enforceNoEviction', () => {
    it('sets maxmemory-policy on bootstrap without blocking startup', () => {
      client.config.mockResolvedValue('OK');
      expect(() => service.onApplicationBootstrap()).not.toThrow();
      expect(client.config).toHaveBeenCalledWith(
        'SET',
        'maxmemory-policy',
        'noeviction',
      );
    });

    it('swallows a provider CONFIG SET rejection (managed Redis)', async () => {
      client.config.mockRejectedValue(new Error('CONFIG blocked'));
      expect(() => service.onApplicationBootstrap()).not.toThrow();
      // let the fire-and-forget promise settle
      await new Promise((r) => setImmediate(r));
    });
  });

  // L12: the cache helpers were removed with the cache feature.
  it('has no leftover cache helpers', () => {
    for (const name of [
      'mget',
      'getJson',
      'setJson',
      'incr',
      'hincrby',
      'hincrbyMany',
      'hgetall',
      'tryRename',
      'expire',
      'releaseLock',
    ]) {
      expect({ name, present: name in service }).toEqual({
        name,
        present: false,
      });
    }
  });
});
