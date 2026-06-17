#!/bin/sh
set -eu

echo "[entrypoint] waiting for database (max 60s)"
node -e "
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
if (!url) {
  const host = process.env.DATABASE_HOST || 'localhost';
  const port = process.env.DATABASE_PORT || '5432';
  const user = process.env.DATABASE_USER || 'postgres';
  const pass = process.env.DATABASE_PASSWORD || '';
  const db   = process.env.DATABASE_NAME || 'app';
  process.env.DATABASE_URL = 'postgres://' + encodeURIComponent(user) + ':' + encodeURIComponent(pass) + '@' + host + ':' + port + '/' + db;
}
const max = 30;
let attempt = 0;
const poll = async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 2000 });
  try {
    await pool.query('SELECT 1');
    await pool.end();
    process.exit(0);
  } catch (e) {
    await pool.end().catch(() => {});
    attempt++;
    if (attempt >= max) {
      console.error('[entrypoint] db not reachable after ' + (max * 2) + 's:', e.message);
      process.exit(1);
    }
    setTimeout(poll, 2000);
  }
};
poll();
"

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo '[entrypoint] running migrations'
  node -e "
  const { Pool } = require('pg');
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { migrate } = require('drizzle-orm/node-postgres/migrator');
  const url = process.env.DATABASE_URL;
  if (!url) {
    const host = process.env.DATABASE_HOST || 'localhost';
    const port = process.env.DATABASE_PORT || '5432';
    const user = process.env.DATABASE_USER || 'postgres';
    const pass = process.env.DATABASE_PASSWORD || '';
    const db   = process.env.DATABASE_NAME || 'app';
    process.env.DATABASE_URL = 'postgres://' + encodeURIComponent(user) + ':' + encodeURIComponent(pass) + '@' + host + ':' + port + '/' + db;
  }
  (async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const db = drizzle(pool);
    // Serialize migrations across replicas: a session-level advisory lock means
    // only one booting instance migrates at a time; the rest wait, then find the
    // schema already current. Prevents concurrent migrators deadlocking.
    const LOCK_KEY = 776655;
    try {
      await pool.query('SELECT pg_advisory_lock(\$1)', [LOCK_KEY]);
      await migrate(db, { migrationsFolder: './drizzle' });
      await pool.query('SELECT pg_advisory_unlock(\$1)', [LOCK_KEY]);
    } finally {
      await pool.end().catch(() => {});
    }
  })().catch((e) => { console.error('[entrypoint] migration failed:', e.message); process.exit(1); });
  "
else
  echo '[entrypoint] RUN_MIGRATIONS!=true, skipping migrations'
fi

echo '[entrypoint] starting app'
exec node dist/src/main.js
