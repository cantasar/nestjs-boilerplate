import 'reflect-metadata';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// Serialize migrations across replicas: a session-level advisory lock means only
// one booting instance migrates at a time; the rest wait, then find the schema
// already current. Prevents concurrent migrators deadlocking.
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
  // void-ok
  const pool = new Pool({ connectionString: resolveConnectionUrl(), max: 1 });
  const db = drizzle(pool);
  // eslint-disable-next-line no-console
  console.log('[migrate] starting');
  try {
    await pool.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    // No-op when the migrations folder is missing/empty or the schema is current.
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await pool.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    // eslint-disable-next-line no-console
    console.log('[migrate] done');
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed', err);
  process.exit(1);
});
