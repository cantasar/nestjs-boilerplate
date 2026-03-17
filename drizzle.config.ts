import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

function getConnectionUrl(): string {
  if (process.env.DATABASE_URL?.startsWith('postgres')) {
    return process.env.DATABASE_URL;
  }
  const host = process.env.DATABASE_HOST ?? 'localhost';
  const port = process.env.DATABASE_PORT ?? 5432;
  const user = encodeURIComponent(process.env.DATABASE_USER ?? 'postgres');
  const password = encodeURIComponent(process.env.DATABASE_PASSWORD ?? '');
  const database = process.env.DATABASE_NAME ?? 'app';
  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

export default defineConfig({
  out: './drizzle',
  schema: './src/database/schema/*.schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: getConnectionUrl(),
  },
});
