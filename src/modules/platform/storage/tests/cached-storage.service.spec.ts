import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CachedStorageService } from '../services/cached-storage.service';
import { GcsStorageService } from '../services/gcs-storage.service';
import { REDIS_CLIENT } from '../../../shared/redis/redis.tokens';

describe('CachedStorageService', () => {
  let service: CachedStorageService;

  const mockInner = {
    presignUpload: jest.fn(),
    presignRead: jest.fn(),
    presignReadMany: jest.fn(),
    objectExists: jest.fn(),
  };

  const pipelineExec = jest.fn().mockResolvedValue([]);
  const pipelineSet = jest.fn().mockReturnThis();
  const pipeline = { set: pipelineSet, exec: pipelineExec };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    mget: jest.fn(),
    pipeline: jest.fn(() => pipeline),
  };

  const mockConfig = {
    get: jest.fn(() => 900),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CachedStorageService,
        { provide: GcsStorageService, useValue: mockInner },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(CachedStorageService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('presignRead', () => {
    it('returns cached URL when present', async () => {
      mockRedis.get.mockResolvedValue('https://cached/url');
      const url = await service.presignRead({ key: 'a/b.jpg' });
      expect(url).toBe('https://cached/url');
      expect(mockInner.presignRead).not.toHaveBeenCalled();
    });

    it('signs and caches when miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockInner.presignRead.mockResolvedValue('https://fresh/url');
      const url = await service.presignRead({ key: 'a/b.jpg' });
      expect(url).toBe('https://fresh/url');
      expect(mockInner.presignRead).toHaveBeenCalledTimes(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'presign:read:a/b.jpg',
        'https://fresh/url',
        'EX',
        840,
      );
    });

    it('bypasses cache when TTL <= 0', async () => {
      mockInner.presignRead.mockResolvedValue('https://fresh/url');
      const url = await service.presignRead({ key: 'a/b.jpg', expiresIn: 30 });
      expect(url).toBe('https://fresh/url');
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('presignReadMany', () => {
    it('returns empty map for empty input', async () => {
      const result = await service.presignReadMany([]);
      expect(result.size).toBe(0);
      expect(mockRedis.mget).not.toHaveBeenCalled();
    });

    it('mixes cache hits and misses, signing only missing keys', async () => {
      mockRedis.mget.mockResolvedValue([
        'https://cached/k1',
        null,
        'https://cached/k3',
      ]);
      mockInner.presignReadMany.mockResolvedValue(
        new Map([['k2', 'https://fresh/k2']]),
      );

      const result = await service.presignReadMany(['k1', 'k2', 'k3']);

      expect(result.get('k1')).toBe('https://cached/k1');
      expect(result.get('k2')).toBe('https://fresh/k2');
      expect(result.get('k3')).toBe('https://cached/k3');
      expect(mockInner.presignReadMany).toHaveBeenCalledWith(['k2'], undefined);
      expect(pipelineSet).toHaveBeenCalledWith(
        'presign:read:k2',
        'https://fresh/k2',
        'EX',
        840,
      );
      expect(pipelineExec).toHaveBeenCalled();
    });

    it('deduplicates input keys before MGET', async () => {
      mockRedis.mget.mockResolvedValue(['https://cached/k1']);
      const result = await service.presignReadMany(['k1', 'k1', 'k1']);
      expect(mockRedis.mget).toHaveBeenCalledWith('presign:read:k1');
      expect(result.size).toBe(1);
    });

    it('bypasses cache when TTL <= 0', async () => {
      mockInner.presignReadMany.mockResolvedValue(
        new Map([['k1', 'https://fresh/k1']]),
      );
      const result = await service.presignReadMany(['k1'], 30);
      expect(mockInner.presignReadMany).toHaveBeenCalledWith(['k1'], 30);
      expect(mockRedis.mget).not.toHaveBeenCalled();
      expect(result.get('k1')).toBe('https://fresh/k1');
    });
  });

  describe('passthroughs', () => {
    it('delegates presignUpload to inner', async () => {
      mockInner.presignUpload.mockResolvedValue('https://put/url');
      const url = await service.presignUpload({
        key: 'k',
        contentType: 'image/jpeg',
      });
      expect(url).toBe('https://put/url');
      expect(mockInner.presignUpload).toHaveBeenCalledWith({
        key: 'k',
        contentType: 'image/jpeg',
      });
    });

    it('delegates objectExists to inner', async () => {
      mockInner.objectExists.mockResolvedValue(true);
      expect(await service.objectExists('k')).toBe(true);
      expect(mockInner.objectExists).toHaveBeenCalledWith('k');
    });
  });
});
