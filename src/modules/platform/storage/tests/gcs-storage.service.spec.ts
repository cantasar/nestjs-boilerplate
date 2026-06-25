import type { ConfigService } from '@nestjs/config';

const mockSign = {
  fn: (key: string): Promise<[string]> => Promise.resolve([`url-${key}`]),
};

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: () => ({
      file: (key: string) => ({ getSignedUrl: () => mockSign.fn(key) }),
    }),
  })),
}));

import { GcsStorageService } from '../services/gcs-storage.service';

function makeService(): GcsStorageService {
  const config = {
    get: (k: string) => {
      if (k === 'GCS_BUCKET') return 'bucket';
      if (k === 'GCP_PROJECT_ID') return 'proj';
      if (k === 'GCS_PRESIGN_EXPIRES') return 900;
      return undefined;
    },
  } as unknown as ConfigService;
  return new GcsStorageService(config);
}

describe('GcsStorageService signing', () => {
  afterEach(() => {
    mockSign.fn = (key) => Promise.resolve([`url-${key}`]);
  });

  it('presignRead retries a transient signBlob failure then succeeds', async () => {
    let calls = 0;
    mockSign.fn = (key) => {
      calls++;
      return calls === 1
        ? Promise.reject(new Error('signBlob: Premature close'))
        : Promise.resolve([`url-${key}`]);
    };
    await expect(makeService().presignRead({ key: 'a' })).resolves.toBe(
      'url-a',
    );
    expect(calls).toBe(2);
  });

  it('presignRead fails fast (no retry) on a non-transient error', async () => {
    let calls = 0;
    mockSign.fn = () => {
      calls++;
      return Promise.reject(new Error('AccessDenied'));
    };
    await expect(makeService().presignRead({ key: 'a' })).rejects.toThrow(
      'AccessDenied',
    );
    expect(calls).toBe(1);
  });

  it('presignReadMany returns a partial map when one key fails, never throws', async () => {
    mockSign.fn = (key) =>
      key === 'b'
        ? Promise.reject(new Error('AccessDenied'))
        : Promise.resolve([`url-${key}`]);
    const map = await makeService().presignReadMany(['a', 'b', 'c']);
    expect(map.size).toBe(2);
    expect(map.get('a')).toBe('url-a');
    expect(map.get('c')).toBe('url-c');
    expect(map.has('b')).toBe(false);
  });

  it('presignReadMany returns all urls when every key signs', async () => {
    const map = await makeService().presignReadMany(['a', 'b', 'c']);
    expect(map.size).toBe(3);
  });
});
