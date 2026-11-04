import { z } from 'zod';

const optionalNumber = z.coerce.number().int().positive().optional();

// Unknown keys pass through, so webhooks can read their own env vars by name.
export const envSchema = z
  .looseObject({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGIN: z.string().optional(),
    BODY_PARSER_LIMIT: z.string().default('1mb'),

    // Database: DATABASE_URL wins over the separate parts.
    DATABASE_URL: z.string().optional(),
    DATABASE_HOST: z.string().default('localhost'),
    DATABASE_PORT: z.coerce.number().int().positive().default(5432),
    DATABASE_USER: z.string().default('postgres'),
    DATABASE_PASSWORD: z.string().default(''),
    DATABASE_NAME: z.string().default('app'),

    REDIS_URL: z.string().default('redis://localhost:6379'),

    JWT_SECRET: z.string().min(1).default('secret'),
    JWT_EXPIRATION: z.string().default('15m'),
    JWT_REFRESH_EXPIRATION: z.string().default('7d'),

    // Server-to-server key for @ApiKeyAuth() routes. When unset those routes always reject.
    API_KEY: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string().optional(),
    APPLE_BUNDLE_ID: z.string().optional(),

    // Email verification flow overrides (defaults live in auth.constants.ts).
    AUTH_EMAIL_VERIFY_SESSION_TTL_SECONDS: optionalNumber,
    AUTH_OTP_MAX_ATTEMPTS: optionalNumber,
    AUTH_RESEND_RATE_LIMIT_MAX: optionalNumber,
    AUTH_RESEND_RATE_LIMIT_WINDOW_SECONDS: optionalNumber,
    // 'true' returns the code in the response for local testing. Ignored in production.
    AUTH_DEBUG_RETURN_OTP: z.enum(['true', 'false']).optional(),

    QUEUE_PREFIX: z.string().optional(),
    QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
    QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().int().positive().default(3),
    QUEUE_DEFAULT_BACKOFF_MS: z.coerce.number().int().positive().default(1000),

    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_REDIS_PREFIX: z.string().default('throttle:'),

    // Mail (ZeptoMail). Mail is skipped with a warning until these are set.
    ZEPTOMAIL_URL: z.url().optional(),
    ZEPTOMAIL_TOKEN: z.string().optional(),
    MAIL_FROM_ADDRESS: z.email().optional(),
    MAIL_FROM_NAME: z.string().optional(),
    MAIL_LOGO_URL: z.url().optional(),
    APP_PUBLIC_URL: z.url().optional(),

    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    SWAGGER_BASIC_AUTH_USER: z.string().optional(),
    SWAGGER_BASIC_AUTH_PASSWORD: z.string().optional(),
    SWAGGER_SERVERS: z.string().optional(),

    // First admin seed: set both to create an admin once on startup.
    FIRST_ADMIN_EMAIL: z.email().optional(),
    FIRST_ADMIN_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((env, ctx) => {
    // The 'secret' default is for local dev only. Production needs a real secret.
    if (
      env.NODE_ENV === 'production' &&
      (env.JWT_SECRET === 'secret' || env.JWT_SECRET.length < 32)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message:
          'JWT_SECRET must be a non-default value of at least 32 characters when NODE_ENV is production',
      });
    }
    if (Boolean(env.FIRST_ADMIN_EMAIL) !== Boolean(env.FIRST_ADMIN_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        path: [
          env.FIRST_ADMIN_EMAIL ? 'FIRST_ADMIN_PASSWORD' : 'FIRST_ADMIN_EMAIL',
        ],
        message:
          'FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD must be set together',
      });
    }
  });
