import { z } from 'zod';

/**
 * All env variables and defaults are defined here.
 * Modules use ConfigService.getOrThrow only – no fallback.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().optional(),
    DATABASE_HOST: z.string().default('localhost'),
    DATABASE_PORT: z.coerce.number().int().positive().default(5432),
    DATABASE_USER: z.string().default('postgres'),
    DATABASE_PASSWORD: z.string().default(''),
    DATABASE_NAME: z.string().default('app'),

    JWT_SECRET: z.string().min(1),
    JWT_EXPIRATION: z.string().default('15m'),
    JWT_REFRESH_EXPIRATION: z.string().default('7d'),

    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_TTL: z.coerce.number().int().positive().default(180),

    ZEPTOMAIL_URL: z.string().url().optional(),
    ZEPTOMAIL_TOKEN: z.string().optional(),
    MAIL_FROM_ADDRESS: z.string().email().optional(),
    MAIL_FROM_NAME: z.string().optional(),

    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

    CORS_ORIGIN: z.string().optional(),
  })
  .catchall(z.unknown());

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Environment validation error: ${message}`);
  }

  return parsed.data;
};
