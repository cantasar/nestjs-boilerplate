import './load-env';
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// Advisory lock: only one replica migrates at a time, which avoids deadlocks.
// The others wait, then find the schema already up to date.
const ADVISORY_LOCK_KEY = 776655;
const MIGRATIONS_FOLDER = './drizzle';

function resolveConnectionUrl(): string {
  if (process.env.DATABASE_URL?.startsWith('postgres')) {
    return process.env.DATABASE_URL;
  }
  const host = process.env.DATABASE_HOST ?? 'localhost';
  const port = process.env.DATABASE_PORT ?? '5432';
  const user = encodeURIComponent(process.env.DATABASE_USER ?? 'postgres');
  const password = encodeURIComponent(process.env.DATABASE_PASSWORD ?? '');
  const database = process.env.DATABASE_NAME ?? 'app';
  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

async function main(): Promise<void> {
  // drizzle fails without a journal, so say what to do instead.
  if (!existsSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))) {
    throw new Error(
      'No migrations in ./drizzle. Run `pnpm db:generate` and commit the files.',
    );
  }
  const pool = new Pool({ connectionString: resolveConnectionUrl(), max: 1 });
  const db = drizzle(pool);
  // eslint-disable-next-line no-console
  console.log('[migrate] starting');
  try {
    await pool.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    // No-op when the schema is already current.
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    // eslint-disable-next-line no-console
    console.log('[migrate] done');
  } finally {
    // Always release the lock, even if the migration failed. Unlocking is a
    // harmless no-op when the lock is not held.
    await pool
      .query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
      .catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed', err);
  process.exit(1);
});
