import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envSchema } from './env.schema';
import { validateEnv } from './env.validation';

const STRONG_SECRET = 'a'.repeat(32);

function issuesFor(input: Record<string, unknown>): string[] {
  const parsed = envSchema.safeParse(input);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => issue.path.join('.'));
}

/** Reads `KEY=value` lines (also commented ones) from the template. */
function templateEntries(): { key: string; value: string; active: boolean }[] {
  const text = readFileSync(
    join(__dirname, '../../../../..', '.env.example'),
    'utf8',
  );
  return text
    .split('\n')
    .map((line) => /^(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      key: match[2] ?? '',
      value: match[3] ?? '',
      active: match[1] === undefined,
    }));
}

describe('envSchema', () => {
  it('boots with defaults only (local dev)', () => {
    const env = validateEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRATION).toBe('15m');
    expect(env.JWT_REFRESH_EXPIRATION).toBe('7d');
    expect(env.RATE_LIMIT_TTL).toBe(60000);
    expect(env.RATE_LIMIT_MAX).toBe(100);
    expect(env.BODY_PARSER_LIMIT).toBe('1mb');
  });

  it('coerces numbers from strings', () => {
    const env = validateEnv({ PORT: '8080', RATE_LIMIT_MAX: '7' });
    expect(env.PORT).toBe(8080);
    expect(env.RATE_LIMIT_MAX).toBe(7);
  });

  it('keeps unknown keys, so webhooks can read their own env vars', () => {
    const env = validateEnv({ ORDER_EVENTS_WEBHOOK_URL: 'https://x.test' });
    expect(env).toHaveProperty('ORDER_EVENTS_WEBHOOK_URL', 'https://x.test');
  });

  it('throws one readable error with every bad key', () => {
    expect(() => validateEnv({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
      /Environment validation error: .*PORT.*NODE_ENV|NODE_ENV.*PORT/,
    );
  });

  describe('JWT_SECRET in production', () => {
    it('rejects the default secret', () => {
      expect(issuesFor({ NODE_ENV: 'production' })).toContain('JWT_SECRET');
    });

    it('rejects a secret shorter than 32 characters', () => {
      expect(
        issuesFor({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(31) }),
      ).toContain('JWT_SECRET');
    });

    it('accepts a 32+ character secret', () => {
      expect(
        issuesFor({ NODE_ENV: 'production', JWT_SECRET: STRONG_SECRET }),
      ).toEqual([]);
    });

    it('allows the dev default outside production', () => {
      expect(issuesFor({ NODE_ENV: 'development' })).toEqual([]);
      expect(issuesFor({ NODE_ENV: 'test' })).toEqual([]);
    });

    it('rejects an empty secret everywhere', () => {
      expect(issuesFor({ JWT_SECRET: '' })).toContain('JWT_SECRET');
    });
  });

  describe('first admin seed', () => {
    it('needs the password when the email is set', () => {
      expect(issuesFor({ FIRST_ADMIN_EMAIL: 'admin@example.com' })).toEqual([
        'FIRST_ADMIN_PASSWORD',
      ]);
    });

    it('needs the email when the password is set', () => {
      expect(issuesFor({ FIRST_ADMIN_PASSWORD: 'long-enough-1' })).toEqual([
        'FIRST_ADMIN_EMAIL',
      ]);
    });

    it('accepts both together', () => {
      expect(
        issuesFor({
          FIRST_ADMIN_EMAIL: 'admin@example.com',
          FIRST_ADMIN_PASSWORD: 'long-enough-1',
        }),
      ).toEqual([]);
    });

    it('rejects a short password and a bad email', () => {
      expect(
        issuesFor({
          FIRST_ADMIN_EMAIL: 'not-an-email',
          FIRST_ADMIN_PASSWORD: 'short',
        }),
      ).toEqual(
        expect.arrayContaining(['FIRST_ADMIN_EMAIL', 'FIRST_ADMIN_PASSWORD']),
      );
    });
  });

  describe('AUTH_* overrides', () => {
    const keys = [
      'AUTH_EMAIL_VERIFY_SESSION_TTL_SECONDS',
      'AUTH_OTP_MAX_ATTEMPTS',
      'AUTH_RESEND_RATE_LIMIT_MAX',
      'AUTH_RESEND_RATE_LIMIT_WINDOW_SECONDS',
    ];

    it.each(keys)('%s is optional', (key) => {
      expect(validateEnv({})[key as keyof ReturnType<typeof validateEnv>]).toBe(
        undefined,
      );
    });

    it.each(keys)('%s coerces a positive integer', (key) => {
      expect(validateEnv({ [key]: '30' })).toHaveProperty(key, 30);
    });

    it.each(keys)('%s rejects zero, negatives, decimals and text', (key) => {
      for (const bad of ['0', '-5', '1.5', 'ten']) {
        expect(issuesFor({ [key]: bad })).toContain(key);
      }
    });

    it('AUTH_DEBUG_RETURN_OTP takes only "true" or "false"', () => {
      expect(issuesFor({ AUTH_DEBUG_RETURN_OTP: 'true' })).toEqual([]);
      expect(issuesFor({ AUTH_DEBUG_RETURN_OTP: 'false' })).toEqual([]);
      expect(issuesFor({ AUTH_DEBUG_RETURN_OTP: 'yes' })).toContain(
        'AUTH_DEBUG_RETURN_OTP',
      );
    });
  });

  describe('mail branding', () => {
    it('accepts valid URLs and a valid sender', () => {
      expect(
        issuesFor({
          ZEPTOMAIL_URL: 'https://api.zeptomail.com/',
          MAIL_FROM_ADDRESS: 'no-reply@example.com',
          MAIL_FROM_NAME: 'App',
          MAIL_LOGO_URL: 'https://example.com/logo.png',
          APP_PUBLIC_URL: 'https://api.example.com',
        }),
      ).toEqual([]);
    });

    it.each(['ZEPTOMAIL_URL', 'MAIL_LOGO_URL', 'APP_PUBLIC_URL'])(
      '%s must be a URL',
      (key) => {
        expect(issuesFor({ [key]: 'not a url' })).toContain(key);
      },
    );

    it('MAIL_FROM_ADDRESS must be an email', () => {
      expect(issuesFor({ MAIL_FROM_ADDRESS: 'nope' })).toContain(
        'MAIL_FROM_ADDRESS',
      );
    });
  });

  it('SWAGGER_ENABLED takes only "true" or "false"', () => {
    expect(issuesFor({ SWAGGER_ENABLED: '1' })).toContain('SWAGGER_ENABLED');
  });
});

describe('.env.example', () => {
  // Read by name from process.env elsewhere, so they are not in the schema on purpose.
  const NOT_IN_SCHEMA = new Set([
    'RUN_MIGRATIONS',
    'ORDER_EVENTS_WEBHOOK_URL',
    'ORDER_EVENTS_WEBHOOK_SECRET',
  ]);

  it('lists every schema key (CLAUDE.md: keep them in sync)', () => {
    const templateKeys = new Set(templateEntries().map((entry) => entry.key));
    const missing = Object.keys(envSchema.shape).filter(
      (key) => !templateKeys.has(key),
    );
    expect(missing).toEqual([]);
  });

  it('has no key the schema does not know', () => {
    const unknown = templateEntries()
      .map((entry) => entry.key)
      .filter((key) => !(key in envSchema.shape) && !NOT_IN_SCHEMA.has(key));
    expect(unknown).toEqual([]);
  });

  it('boots in development with the uncommented template values', () => {
    const active = Object.fromEntries(
      templateEntries()
        .filter((entry) => entry.active)
        .map((entry) => [entry.key, entry.value]),
    );
    expect(issuesFor(active)).toEqual([]);
  });

  it('refuses to boot in production with the template JWT secret', () => {
    const active = Object.fromEntries(
      templateEntries()
        .filter((entry) => entry.active)
        .map((entry) => [entry.key, entry.value]),
    );
    expect(issuesFor({ ...active, NODE_ENV: 'production' })).toContain(
      'JWT_SECRET',
    );
  });

  it('every commented example value is valid for its key', () => {
    const examples = Object.fromEntries(
      templateEntries()
        .filter((entry) => !NOT_IN_SCHEMA.has(entry.key))
        .map((entry) => [entry.key, entry.value]),
    );
    expect(issuesFor(examples)).toEqual([]);
  });
});
