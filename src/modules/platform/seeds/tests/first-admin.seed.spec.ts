import * as bcrypt from 'bcrypt';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DrizzleDB } from '../../../shared/database/database.types';
import { FirstAdminSeed } from '../first-admin.seed';
import { UserRole } from '../../../shared/database/schema/enums/user-role.enum';
import { AUTH_CONSTANTS } from '../../auth/auth.constants';

function makeDb(opts: {
  existing: boolean;
  existingRole?: UserRole;
  insertedRows?: unknown[];
}) {
  const limit = jest
    .fn()
    .mockResolvedValue(
      opts.existing ? [{ role: opts.existingRole ?? UserRole.USER }] : [],
    );
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });

  const returning = jest
    .fn()
    .mockResolvedValue(opts.insertedRows ?? [{ id: 2 }]);
  const onConflictDoNothing = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoNothing });
  const insert = jest.fn().mockReturnValue({ values });
  // A seed must never touch an existing row (no promote, no password reset).
  const update = jest.fn();
  const del = jest.fn();

  return {
    db: { select, insert, update, delete: del } as unknown as DrizzleDB,
    select,
    insert,
    values,
    onConflictDoNothing,
    update,
    del,
  };
}

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: jest.fn((k: string) => values[k]) } as unknown as ConfigService;
}

interface InsertedAdmin {
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
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

  it('skips when only one of the two env vars is set', async () => {
    const { db, insert } = makeDb({ existing: false });
    await new FirstAdminSeed(
      db,
      makeConfig({ FIRST_ADMIN_EMAIL: ENV.FIRST_ADMIN_EMAIL }),
    ).onApplicationBootstrap();
    await new FirstAdminSeed(
      db,
      makeConfig({ FIRST_ADMIN_PASSWORD: ENV.FIRST_ADMIN_PASSWORD }),
    ).onApplicationBootstrap();
    expect(insert).not.toHaveBeenCalled();
  });

  it('never changes an existing user with that email (no silent promotion)', async () => {
    const { db, insert, update, del } = makeDb({ existing: true });
    const seed = new FirstAdminSeed(db, makeConfig(ENV));
    await seed.onApplicationBootstrap();
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('creates the admin with role ADMIN, a verified email and a bcrypt hash', async () => {
    const { db, insert, values, onConflictDoNothing } = makeDb({
      existing: false,
    });
    const seed = new FirstAdminSeed(db, makeConfig(ENV));
    await seed.onApplicationBootstrap();

    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = values.mock.calls[0]?.[0] as InsertedAdmin;
    expect(inserted.email).toBe(ENV.FIRST_ADMIN_EMAIL);
    expect(inserted.role).toBe(UserRole.ADMIN);
    expect(inserted.isActive).toBe(true);
    expect(inserted.emailVerified).toBe(true);
    expect(inserted.password).not.toBe(ENV.FIRST_ADMIN_PASSWORD);
    expect(inserted.password).toMatch(/^\$2[aby]\$12\$/);
    await expect(
      bcrypt.compare(ENV.FIRST_ADMIN_PASSWORD, inserted.password),
    ).resolves.toBe(true);
    // Multi-replica safety: the insert must carry the conflict guard.
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it('stores the email trimmed and lowercased, like the login lookup', async () => {
    const { db, values } = makeDb({ existing: false });
    const seed = new FirstAdminSeed(
      db,
      makeConfig({ ...ENV, FIRST_ADMIN_EMAIL: '  Admin@Example.COM ' }),
    );
    await seed.onApplicationBootstrap();

    const inserted = values.mock.calls[0]?.[0] as InsertedAdmin;
    expect(inserted.email).toBe('admin@example.com');
  });

  it('tolerates losing the concurrent-replica race (0 rows inserted)', async () => {
    const { db } = makeDb({ existing: false, insertedRows: [] });
    const seed = new FirstAdminSeed(db, makeConfig(ENV));
    await expect(seed.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  describe('when the email already exists (L7)', () => {
    let warn: jest.SpyInstance;
    let log: jest.SpyInstance;

    beforeEach(() => {
      warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('reads the role of the existing row', async () => {
      const { db, select } = makeDb({ existing: true });
      await new FirstAdminSeed(db, makeConfig(ENV)).onApplicationBootstrap();
      const [fields] = select.mock.calls[0] as [Record<string, unknown>];
      expect(Object.keys(fields)).toEqual(['role']);
    });

    it('warns (and changes nothing) when a normal user owns FIRST_ADMIN_EMAIL', async () => {
      const { db, insert, update } = makeDb({
        existing: true,
        existingRole: UserRole.USER,
      });
      await new FirstAdminSeed(db, makeConfig(ENV)).onApplicationBootstrap();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('belongs to a normal user'),
      );
      expect(log).not.toHaveBeenCalledWith('First admin already exists');
      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('only logs when the existing row is already an admin', async () => {
      const { db } = makeDb({ existing: true, existingRole: UserRole.ADMIN });
      await new FirstAdminSeed(db, makeConfig(ENV)).onApplicationBootstrap();

      expect(log).toHaveBeenCalledWith('First admin already exists');
      expect(warn).not.toHaveBeenCalled();
    });

    it('never puts the email or the password in a log line', async () => {
      const { db } = makeDb({ existing: true, existingRole: UserRole.USER });
      await new FirstAdminSeed(db, makeConfig(ENV)).onApplicationBootstrap();

      const lines = [...warn.mock.calls, ...log.mock.calls].flat().join(' ');
      expect(lines).not.toContain(ENV.FIRST_ADMIN_EMAIL);
      expect(lines).not.toContain(ENV.FIRST_ADMIN_PASSWORD);
    });
  });

  it('hashes with the shared AUTH_CONSTANTS cost', async () => {
    const { db, values } = makeDb({ existing: false });
    await new FirstAdminSeed(db, makeConfig(ENV)).onApplicationBootstrap();
    const inserted = values.mock.calls[0]?.[0] as InsertedAdmin;
    const cost = inserted.password.split('$')[2];
    expect(Number(cost)).toBe(AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS);
  });
});
