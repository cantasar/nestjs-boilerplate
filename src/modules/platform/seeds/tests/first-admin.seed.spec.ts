import type { ConfigService } from '@nestjs/config';
import type { DrizzleDB } from '../../../shared/database/database.types';
import { FirstAdminSeed } from '../first-admin.seed';

function makeDb(opts: { existing: boolean; insertedRows?: unknown[] }) {
  const limit = jest.fn().mockResolvedValue(opts.existing ? [{ id: 1 }] : []);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });

  const returning = jest
    .fn()
    .mockResolvedValue(opts.insertedRows ?? [{ id: 2 }]);
  const onConflictDoNothing = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoNothing });
  const insert = jest.fn().mockReturnValue({ values });

  return {
    db: { select, insert } as unknown as DrizzleDB,
    insert,
    values,
    onConflictDoNothing,
  };
}

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: jest.fn((k: string) => values[k]) } as unknown as ConfigService;
}

describe('FirstAdminSeed', () => {
  const ENV = {
    FIRST_ADMIN_EMAIL: 'admin@example.com',
    FIRST_ADMIN_PASSWORD: 'super-secret-1',
  };

  it('skips when env vars are unset', async () => {
    const { db, insert } = makeDb({ existing: false });
    const seed = new FirstAdminSeed(db, makeConfig({}));
    await seed.onApplicationBootstrap();
    expect(insert).not.toHaveBeenCalled();
  });

  it('skips when the admin already exists (idempotent)', async () => {
    const { db, insert } = makeDb({ existing: true });
    const seed = new FirstAdminSeed(db, makeConfig(ENV));
    await seed.onApplicationBootstrap();
    expect(insert).not.toHaveBeenCalled();
  });

  it('creates the admin with a bcrypt hash (never the raw password)', async () => {
    const { db, insert, values, onConflictDoNothing } = makeDb({
      existing: false,
    });
    const seed = new FirstAdminSeed(db, makeConfig(ENV));
    await seed.onApplicationBootstrap();

    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = values.mock.calls[0]?.[0] as {
      email: string;
      password: string;
      isActive: boolean;
      emailVerified: boolean;
    };
    expect(inserted.email).toBe(ENV.FIRST_ADMIN_EMAIL);
    expect(inserted.password).not.toBe(ENV.FIRST_ADMIN_PASSWORD);
    expect(inserted.password).toMatch(/^\$2[aby]\$/); // bcrypt hash
    expect(inserted.isActive).toBe(true);
    expect(inserted.emailVerified).toBe(true);
    // multi-replica safety: the insert must carry the conflict guard
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it('tolerates losing the concurrent-replica race (0 rows inserted)', async () => {
    const { db } = makeDb({ existing: false, insertedRows: [] });
    const seed = new FirstAdminSeed(db, makeConfig(ENV));
    await expect(seed.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
