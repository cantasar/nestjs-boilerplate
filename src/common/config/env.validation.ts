import { envSchema } from './env.schema';
import type { Env } from './env.types';

/**
 * Validates `process.env`-backed config for ConfigModule.
 * @param config - Raw config object from Nest
 * @returns Parsed and typed environment
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Environment validation error: ${message}`);
  }
  return parsed.data;
}
