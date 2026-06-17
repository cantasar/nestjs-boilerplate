import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().optional(),
    DATABASE_HOST: z.string().default('localhost'),
    DATABASE_PORT: z.coerce.number().int().positive().default(5432),
    DATABASE_USER: z.string().default('postgres'),
    DATABASE_PASSWORD: z.string().default(''),
    DATABASE_NAME: z.string().default('app'),
    JWT_SECRET: z.string().min(1).default('secret'),
    JWT_EXPIRATION: z.string().default('15m'),
    JWT_REFRESH_EXPIRATION: z.string().default('7d'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_TTL: z.coerce.number().int().positive().default(180),
    QUEUE_PREFIX: z.string().optional(),
    QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
    QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().int().positive().default(3),
    QUEUE_DEFAULT_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
    // Media variant generation (resize/thumbnail) worker concurrency. Kept low
    // by default since Sharp is CPU-bound; read from process.env at decoration.
    MEDIA_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(2),
    ZEPTOMAIL_URL: z.string().url().optional(),
    ZEPTOMAIL_TOKEN: z.string().optional(),
    MAIL_FROM_ADDRESS: z.string().email().optional(),
    MAIL_FROM_NAME: z.string().optional(),
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    CORS_ORIGIN: z.string().optional(),
    BODY_PARSER_LIMIT: z.string().default('1mb'),
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    SWAGGER_BASIC_AUTH_USER: z.string().optional(),
    SWAGGER_BASIC_AUTH_PASSWORD: z.string().optional(),
    SWAGGER_SERVERS: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    APPLE_BUNDLE_ID: z.string().optional(),
    // Storage (GCS) — feature-flagged by GCS_BUCKET. When unset the storage
    // service stays dormant and the media-cleanup sweep no-ops.
    GCS_BUCKET: z.string().optional(),
    GCP_PROJECT_ID: z.string().optional(),
    GCS_CREDENTIALS_JSON_BASE64: z.string().optional(),
    GCS_PRESIGN_EXPIRES: z.coerce.number().int().positive().default(900),
    // SMS — feature-flagged by SMS_API_URL. When unset the HTTP sender warns
    // and no-ops. Param-name overrides default to the common code-prefixed style.
    SMS_API_URL: z.string().url().optional(),
    SMS_USER: z.string().optional(),
    SMS_PASS: z.string().optional(),
    SMS_SENDER_HEADER: z.string().optional(),
    SMS_SUCCESS_PREFIX: z.string().optional(),
    SMS_OTP_TEMPLATE: z.string().optional(),
    SMS_USER_PARAM: z.string().optional(),
    SMS_PASS_PARAM: z.string().optional(),
    SMS_TO_PARAM: z.string().optional(),
    SMS_MESSAGE_PARAM: z.string().optional(),
    SMS_HEADER_PARAM: z.string().optional(),
    // Push (OneSignal) — feature-flagged by ONESIGNAL_APP_ID. When unset the
    // push sender stays dormant and broadcast/transactional pushes no-op.
    ONESIGNAL_APP_ID: z.string().optional(),
    ONESIGNAL_REST_API_KEY: z.string().optional(),
    // Broadcast fan-out chunk size: recipients per queued job.
    NOTIFICATION_BROADCAST_CHUNK_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(500),
    // Bug-report attachments — opt-in. When 'true' the admin bug-reports feature
    // surfaces media assets bound via the generic entity-ref ('bug_report', id)
    // through the ASSET_PORT. Default 'false' → no attachments are listed.
    BUG_REPORT_ATTACHMENTS_ENABLED: z.enum(['true', 'false']).default('false'),
    // Sentry — opt-in, feature-flagged by SENTRY_DSN. When unset the SDK stays a
    // no-op (see src/instrument.ts). Sample rates are read raw in instrument.ts
    // (it runs before Zod); these defaults document/echo the same fallbacks.
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_RELEASE: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
    SENTRY_PROFILE_SESSION_SAMPLE_RATE: z.coerce
      .number()
      .min(0)
      .max(1)
      .default(1),
  })
  .catchall(z.unknown())
  .superRefine((env, ctx) => {
    // GCS is opt-in: enabling it (GCS_BUCKET set) requires a project id.
    if (env.GCS_BUCKET && !env.GCP_PROJECT_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GCP_PROJECT_ID'],
        message: 'GCP_PROJECT_ID is required when GCS_BUCKET is set',
      });
    }
    // SMS is opt-in: enabling it (SMS_API_URL set) requires credentials.
    if (env.SMS_API_URL && (!env.SMS_USER || !env.SMS_PASS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_USER'],
        message: 'SMS_USER and SMS_PASS are required when SMS_API_URL is set',
      });
    }
    // Push is opt-in: enabling it (ONESIGNAL_APP_ID set) requires the REST key.
    if (env.ONESIGNAL_APP_ID && !env.ONESIGNAL_REST_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ONESIGNAL_REST_API_KEY'],
        message:
          'ONESIGNAL_REST_API_KEY is required when ONESIGNAL_APP_ID is set',
      });
    }
  });
