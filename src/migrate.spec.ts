import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

// migrate.ts runs on import. Nothing here may read a local env file or reach a database.
jest.mock('./load-env', () => ({}));
jest.mock('node:fs', () => ({
  ...jest.requireActual<typeof import('node:fs')>('node:fs'),
  existsSync: jest.fn(),
}));
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('drizzle-orm/node-postgres', () => ({
  drizzle: jest.fn(() => ({})),
}));
jest.mock('drizzle-orm/node-postgres/migrator', () => ({
  migrate: jest.fn().mockResolvedValue(undefined),
}));

const existsMock = existsSync as jest.Mock;

/** Imports migrate.ts fresh and waits until its main() has finished. */
async function runMigrate(): Promise<{
  exitCode: unknown;
  errors: unknown[][];
}> {
  let exitCode: unknown;
  const exit = jest.spyOn(process, 'exit').mockImplementation(((
    code?: number,
  ) => {
    exitCode = code;
  }) as typeof process.exit);
  const error = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await jest.isolateModulesAsync(async () => {
    await import('./migrate');
  });
  await new Promise((resolve) => setImmediate(resolve));
  const errors = error.mock.calls;
  exit.mockRestore();
  return { exitCode, errors };
}

describe('migrate.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // L26: drizzle-orm throws "Can't find meta/_journal.json" without a journal. Say what to do instead.
  it('stops with a pnpm db:generate hint when drizzle/ has no journal, before any DB connection', async () => {
    existsMock.mockReturnValue(false);

    const { exitCode, errors } = await runMigrate();

    expect(existsMock).toHaveBeenCalledWith('drizzle/meta/_journal.json');
    expect(exitCode).toBe(1);
    expect(String(errors[0]?.[1])).toContain('pnpm db:generate');
    expect(Pool).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
  });

  it('runs the migrations under the advisory lock when the journal exists', async () => {
    existsMock.mockReturnValue(true);

    const { exitCode } = await runMigrate();

    expect(exitCode).toBeUndefined();
    expect(migrate).toHaveBeenCalledWith(expect.anything(), {
      migrationsFolder: './drizzle',
    });
    const pool = (Pool as unknown as jest.Mock).mock.results[0]?.value as {
      query: jest.Mock;
      end: jest.Mock;
    };
    const statements = pool.query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toEqual([
      'SELECT pg_advisory_lock($1)',
      'SELECT pg_advisory_unlock($1)',
    ]);
    expect(pool.end).toHaveBeenCalled();
  });
});
