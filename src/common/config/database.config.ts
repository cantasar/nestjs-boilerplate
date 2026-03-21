import type { ConfigService } from '@nestjs/config';

/**
 * Resolves PostgreSQL connection URL from ConfigService.
 * @param config - Nest ConfigService
 * @returns Connection string
 */
export function getDatabaseUrl(config: ConfigService): string {
  const url = config.get<string>('DATABASE_URL');
  if (url?.startsWith('postgres')) return url;
  const host = config.getOrThrow<string>('DATABASE_HOST');
  const port = config.getOrThrow<number>('DATABASE_PORT');
  const user = config.getOrThrow<string>('DATABASE_USER');
  const password = config.getOrThrow<string>('DATABASE_PASSWORD');
  const database = config.getOrThrow<string>('DATABASE_NAME');
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}
