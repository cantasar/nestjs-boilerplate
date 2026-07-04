import { RedisService } from '../redis.service';
import type Redis from 'ioredis';

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  mget: jest.Mock;
  rename: jest.Mock;
  eval: jest.Mock;
  hincrby: jest.Mock;
  pipeline: jest.Mock;
  config: jest.Mock;
};

function makeClient(): MockRedis {
  return {
    get: jest.fn(),
    set: jest.fn(),
    mget: jest.fn(),
    rename: jest.fn(),
    eval: jest.fn(),
    hincrby: jest.fn(),
    pipeline: jest.fn(),
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

  describe('getJson / setJson', () => {
    it('parses stored JSON', async () => {
      client.get.mockResolvedValue('{"a":1}');
      await expect(service.getJson<{ a: number }>('k')).resolves.toEqual({
        a: 1,
      });
    });

    it('treats a corrupt value as a cache miss', async () => {
      client.get.mockResolvedValue('{oops');
      await expect(service.getJson('k')).resolves.toBeNull();
    });

    it('writes serialized JSON with TTL', async () => {
      await service.setJson('k', { a: 1 }, 60);
      expect(client.set).toHaveBeenCalledWith('k', '{"a":1}', 'EX', 60);
    });
  });

  describe('mget', () => {
    it('short-circuits on an empty key list (no round-trip)', async () => {
      await expect(service.mget([])).resolves.toEqual([]);
      expect(client.mget).not.toHaveBeenCalled();
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
  });

  describe('hincrbyMany', () => {
    it('pipelines one HINCRBY per field', async () => {
      const exec = jest.fn().mockResolvedValue([]);
      const hincrby = jest.fn();
      client.pipeline.mockReturnValue({ hincrby, exec });
      await service.hincrbyMany('h', ['a', 'b'], 2);
      expect(hincrby).toHaveBeenCalledTimes(2);
      expect(hincrby).toHaveBeenCalledWith('h', 'a', 2);
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('no-ops on an empty field list', async () => {
      await service.hincrbyMany('h', []);
      expect(client.pipeline).not.toHaveBeenCalled();
    });
  });

  describe('tryRename', () => {
    it('returns true when the rename succeeds', async () => {
      client.rename.mockResolvedValue('OK');
      await expect(service.tryRename('a', 'b')).resolves.toBe(true);
    });

    it('returns false ONLY for a missing source key', async () => {
      client.rename.mockRejectedValue(new Error('ERR no such key'));
      await expect(service.tryRename('a', 'b')).resolves.toBe(false);
    });

    it('rethrows any other error (connection down must surface)', async () => {
      client.rename.mockRejectedValue(new Error('connection refused'));
      await expect(service.tryRename('a', 'b')).rejects.toThrow(
        'connection refused',
      );
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
});
