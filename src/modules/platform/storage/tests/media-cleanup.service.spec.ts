import { Test } from '@nestjs/testing';
import { MediaCleanupService } from '../services/media-cleanup.service';
import {
  STORAGE_SERVICE,
  type StorageObjectInfo,
} from '../interfaces/storage.types';
import {
  MEDIA_CLEANUP_OPTIONS,
  type MediaCleanupOptions,
} from '../interfaces/media-cleanup-options.interface';
import {
  MEDIA_REFERENCE_PROVIDERS,
  type MediaReferenceProvider,
} from '../interfaces/media-reference-provider.interface';
import { RedisService } from '../../../shared/redis/redis.service';

describe('MediaCleanupService', () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  let now: number;

  const mockStorage = {
    listObjects: jest.fn<Promise<StorageObjectInfo[]>, [string]>(),
    deleteObject: jest.fn<Promise<void>, [string]>(),
  };

  const mockRedis = {
    acquireLock: jest.fn<Promise<string | null>, [string, number]>(),
    releaseLock: jest.fn<Promise<void>, [string, string]>(),
  };

  const collectReferencedKeys = jest.fn<Promise<Set<string>>, []>();
  const provider: MediaReferenceProvider = { collectReferencedKeys };

  function setListByPrefix(map: Record<string, StorageObjectInfo[]>) {
    mockStorage.listObjects.mockImplementation((prefix: string) =>
      Promise.resolve(map[prefix] ?? []),
    );
  }

  async function build(options: MediaCleanupOptions) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaCleanupService,
        { provide: STORAGE_SERVICE, useValue: mockStorage },
        { provide: MEDIA_CLEANUP_OPTIONS, useValue: options },
        { provide: MEDIA_REFERENCE_PROVIDERS, useValue: [provider] },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();
    return moduleRef.get(MediaCleanupService);
  }

  beforeEach(() => {
    now = Date.now();
    jest.clearAllMocks();
    mockStorage.listObjects.mockResolvedValue([]);
    mockStorage.deleteObject.mockResolvedValue(undefined);
    mockRedis.acquireLock.mockResolvedValue('lock-token');
    mockRedis.releaseLock.mockResolvedValue(undefined);
    collectReferencedKeys.mockResolvedValue(new Set());
  });

  it('no-ops without acquiring a lock when no prefixes configured', async () => {
    const service = await build({ prefixes: [] });
    const result = await service.sweepOrphans();
    expect(result).toEqual({
      acquired: false,
      scanned: 0,
      deleted: 0,
      failed: 0,
      skippedNoTimestamp: 0,
    });
    expect(mockRedis.acquireLock).not.toHaveBeenCalled();
    expect(mockStorage.listObjects).not.toHaveBeenCalled();
  });

  it('skips sweep when lock not acquired', async () => {
    mockRedis.acquireLock.mockResolvedValue(null);
    const service = await build({
      prefixes: [{ prefix: 'uploads/', graceMs: DAY }],
    });
    const result = await service.sweepOrphans();
    expect(result.acquired).toBe(false);
    expect(mockStorage.listObjects).not.toHaveBeenCalled();
    expect(mockRedis.releaseLock).not.toHaveBeenCalled();
  });

  it('deletes unreferenced objects older than the grace window', async () => {
    collectReferencedKeys.mockResolvedValue(new Set(['uploads/keep.jpg']));
    setListByPrefix({
      'uploads/': [
        { name: 'uploads/keep.jpg', timeCreated: now - 2 * DAY },
        { name: 'uploads/old-orphan.jpg', timeCreated: now - 2 * DAY },
        { name: 'uploads/recent-orphan.jpg', timeCreated: now - HOUR },
      ],
    });

    const service = await build({
      prefixes: [{ prefix: 'uploads/', graceMs: DAY }],
    });
    const result = await service.sweepOrphans();

    expect(result.deleted).toBe(1);
    expect(mockStorage.deleteObject).toHaveBeenCalledWith(
      'uploads/old-orphan.jpg',
    );
    expect(mockStorage.deleteObject).toHaveBeenCalledTimes(1);
    expect(mockRedis.releaseLock).toHaveBeenCalledWith(
      'cron:media-cleanup:lock',
      'lock-token',
    );
  });

  it('applies per-prefix grace windows independently', async () => {
    setListByPrefix({
      'library/': [
        { name: 'library/5-day.jpg', timeCreated: now - 5 * DAY },
        { name: 'library/9-day.jpg', timeCreated: now - 9 * DAY },
      ],
      'avatars/': [{ name: 'avatars/2-day.jpg', timeCreated: now - 2 * DAY }],
    });

    const service = await build({
      prefixes: [
        { prefix: 'library/', graceMs: 7 * DAY },
        { prefix: 'avatars/', graceMs: DAY },
      ],
    });
    const result = await service.sweepOrphans();

    expect(result.deleted).toBe(2);
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('library/9-day.jpg');
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('avatars/2-day.jpg');
    expect(mockStorage.deleteObject).not.toHaveBeenCalledWith(
      'library/5-day.jpg',
    );
  });

  it('unions referenced keys across multiple providers', async () => {
    const otherCollect = jest
      .fn<Promise<Set<string>>, []>()
      .mockResolvedValue(new Set(['uploads/b.jpg']));
    collectReferencedKeys.mockResolvedValue(new Set(['uploads/a.jpg']));
    setListByPrefix({
      'uploads/': [
        { name: 'uploads/a.jpg', timeCreated: now - 2 * DAY },
        { name: 'uploads/b.jpg', timeCreated: now - 2 * DAY },
        { name: 'uploads/c.jpg', timeCreated: now - 2 * DAY },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaCleanupService,
        { provide: STORAGE_SERVICE, useValue: mockStorage },
        {
          provide: MEDIA_CLEANUP_OPTIONS,
          useValue: { prefixes: [{ prefix: 'uploads/', graceMs: DAY }] },
        },
        {
          provide: MEDIA_REFERENCE_PROVIDERS,
          useValue: [provider, { collectReferencedKeys: otherCollect }],
        },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();
    const service = moduleRef.get(MediaCleanupService);

    const result = await service.sweepOrphans();

    expect(result.deleted).toBe(1);
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('uploads/c.jpg');
  });

  it('skips files with NaN timeCreated', async () => {
    setListByPrefix({
      'uploads/': [{ name: 'uploads/broken.jpg', timeCreated: NaN }],
    });

    const service = await build({
      prefixes: [{ prefix: 'uploads/', graceMs: DAY }],
    });
    const result = await service.sweepOrphans();

    expect(result.deleted).toBe(0);
    expect(result.skippedNoTimestamp).toBe(1);
    expect(mockStorage.deleteObject).not.toHaveBeenCalled();
  });

  it('counts failed deletes without throwing', async () => {
    setListByPrefix({
      'uploads/': [
        { name: 'uploads/a.jpg', timeCreated: now - 2 * DAY },
        { name: 'uploads/b.jpg', timeCreated: now - 2 * DAY },
      ],
    });
    mockStorage.deleteObject
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('backend 500'));

    const service = await build({
      prefixes: [{ prefix: 'uploads/', graceMs: DAY }],
    });
    const result = await service.sweepOrphans();

    expect(result.deleted).toBe(1);
    expect(result.failed).toBe(1);
    expect(mockRedis.releaseLock).toHaveBeenCalled();
  });

  it('releases lock even when sweep throws', async () => {
    collectReferencedKeys.mockRejectedValueOnce(new Error('provider down'));

    const service = await build({
      prefixes: [{ prefix: 'uploads/', graceMs: DAY }],
    });
    await expect(service.sweepOrphans()).rejects.toThrow('provider down');
    expect(mockRedis.releaseLock).toHaveBeenCalled();
  });
});
