// Needs local Postgres + Redis (`docker compose up -d`). Uses its own DB (`app_e2e`) and Redis DB 15.
import { randomBytes, randomUUID } from 'node:crypto';

const RUN = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const E2E_DB = 'app_e2e';
const PG_ADMIN_URL = 'postgres://postgres:postgres@localhost:5432/postgres';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${E2E_DB}`;
process.env.REDIS_URL = 'redis://localhost:6379/15';
process.env.JWT_SECRET = 'e2e-jwt-secret-0123456789-abcdefghij';
process.env.JWT_EXPIRATION = '15m';
process.env.JWT_REFRESH_EXPIRATION = '7d';
process.env.RATE_LIMIT_REDIS_PREFIX = `e2e:${RUN}:throttle:`;
process.env.QUEUE_PREFIX = 'e2e';
process.env.AUTH_DEBUG_RETURN_OTP = 'true';
process.env.BODY_PARSER_LIMIT = '8kb';
process.env.API_KEY = `e2e-api-key-${RUN}`;
process.env.GOOGLE_CLIENT_ID = 'e2e-google-client';
process.env.APPLE_BUNDLE_ID = 'com.example.e2e';
process.env.SWAGGER_BASIC_AUTH_USER = 'docs';
process.env.SWAGGER_BASIC_AUTH_PASSWORD = `docs-${RUN}`;
process.env.FIRST_ADMIN_EMAIL = `E2E.Admin.${RUN}@Example.com`;
process.env.FIRST_ADMIN_PASSWORD = `admin-pass-${RUN}`;
// Mail stays off (warning only), so no test ever calls ZeptoMail.
for (const key of [
  'ZEPTOMAIL_URL',
  'ZEPTOMAIL_TOKEN',
  'MAIL_FROM_ADDRESS',
  'MAIL_FROM_NAME',
  'SWAGGER_ENABLED',
  'CORS_ORIGIN',
]) {
  delete process.env[key];
}

// Fake Google/Apple: the "ID token" is base64url JSON. Garbage throws, like the real libraries.
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation((clientId: string) => ({
    verifyIdToken: async (options: { idToken: string; audience: string }) => {
      const payload = JSON.parse(
        Buffer.from(options.idToken, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      if (options.audience !== clientId || payload.aud !== clientId) {
        throw new Error(
          'Wrong recipient, payload audience != requiredAudience',
        );
      }
      return { getPayload: () => payload };
    },
  })),
}));

// ConfigModule ignores env files now (ignoreEnvFile). This fake still makes sure no test sends mail.
jest.mock('zeptomail', () => ({
  SendMailClient: jest.fn().mockImplementation(() => ({
    sendMail: jest.fn().mockResolvedValue({ data: [] }),
  })),
}));

jest.mock('apple-signin-auth', () => ({
  __esModule: true,
  default: {
    verifyIdToken: async (idToken: string, options: { audience: string }) => {
      const payload = JSON.parse(
        Buffer.from(idToken, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      if (payload.aud !== options.audience) {
        throw new Error('jwt audience invalid');
      }
      return payload;
    },
  },
}));

import { createServer } from 'node:http';
import { Writable } from 'node:stream';
import { Controller, Get, ValidationPipe } from '@nestjs/common';
import { PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import pinoHttp, { type Options as PinoHttpOptions } from 'pino-http';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pushSchema } from 'drizzle-kit/api';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import * as schema from '../src/modules/shared/database/schema';
import {
  DOCS_PREFIX,
  configureVersioning,
} from '../src/modules/shared/common/config/app-versioning';
import { HttpExceptionFilter } from '../src/modules/shared/common/filters/http-exception.filter';
import { setupSwagger } from '../src/swagger/setup-swagger';
import { Roles } from '../src/modules/shared/common/decorators/roles.decorator';
import { Public } from '../src/modules/shared/common/decorators/public.decorator';
import { UserRole } from '../src/modules/shared/database/schema/enums/user-role.enum';
import type Redis from 'ioredis';
import { RedisService } from '../src/modules/shared/redis/redis.service';
import { REDIS_CLIENT } from '../src/modules/shared/redis/redis.tokens';
import { AUTH_REDIS_KEYS } from '../src/modules/platform/auth/auth.constants';

/** Test-only routes to prove the global RolesGuard runs after the JWT guard. */
@Controller({ path: 'e2e-roles', version: '1' })
class RolesProbeController {
  @Get('admin')
  @Roles(UserRole.ADMIN)
  adminOnly(): { ok: boolean } {
    return { ok: true };
  }

  @Get('any')
  anyUser(): { ok: boolean } {
    return { ok: true };
  }

  @Public()
  @Roles(UserRole.ADMIN)
  @Get('public-admin')
  publicAdmin(): { ok: boolean } {
    return { ok: true };
  }
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: string[] };
}

interface SafeUser {
  id: number;
  email: string;
  role: string;
  [key: string]: unknown;
}

interface AuthData {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

type Method = 'get' | 'post' | 'patch' | 'delete';

let app: NestExpressApplication;
let ipSeq = 0;
let emailSeq = 0;

/** Every call gets its own client IP (trust proxy = 1), so the 5/min auth limit only hits the rate-limit test. */
function freshIp(): string {
  ipSeq += 1;
  return `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
}

function http(method: Method, path: string, ip = freshIp()) {
  return request(app.getHttpServer())[method](path).set('X-Forwarded-For', ip);
}

function newEmail(label: string): string {
  emailSeq += 1;
  return `${label}.${RUN}.${emailSeq}@e2e.example.com`;
}

function errorOf(res: request.Response): ErrorBody['error'] {
  return (res.body as ErrorBody).error;
}

function dataOf<T>(res: request.Response): T {
  return (res.body as { data: T }).data;
}

/** Auth POST routes answer 200 (M4); register answers 201. The contract test checks each route. */
function expectSuccess(res: request.Response, status = 200): void {
  expect({
    status: res.status,
    body: res.status === status ? 'ok' : res.body,
  }).toEqual({
    status,
    body: 'ok',
  });
}

/** Runs SQL on the e2e database, for setup that has no API (deactivate a user, read a column). */
async function sql<T extends Record<string, unknown>>(
  text: string,
  values: unknown[],
): Promise<T[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return (await pool.query<T>(text, values)).rows;
  } finally {
    await pool.end();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** JWT `iat` has 1-second steps; wait so two tokens of one user really differ. */
const nextSecond = () => sleep(1100);

function fakeIdToken(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

async function register(
  label: string,
  password = 'password123',
): Promise<{ email: string; password: string; auth: AuthData }> {
  const email = newEmail(label);
  const res = await http('post', '/api/v1/auth/register').send({
    email,
    password,
  });
  expect(res.status).toBe(201);
  return { email, password, auth: dataOf<AuthData>(res) };
}

async function login(email: string, password: string): Promise<AuthData> {
  const res = await http('post', '/api/v1/auth/login').send({
    email,
    password,
  });
  expectSuccess(res);
  return dataOf<AuthData>(res);
}

async function prepareDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: PG_ADMIN_URL });
  try {
    const found = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [E2E_DB],
    );
    if (found.rowCount === 0) await admin.query(`CREATE DATABASE ${E2E_DB}`);
  } finally {
    await admin.end();
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pushSchema(schema, drizzle({ client: pool }));
    if (result.hasDataLoss) {
      throw new Error(
        `Schema push would drop data in ${E2E_DB}: ${result.warnings.join('; ')}`,
      );
    }
    await result.apply();
  } finally {
    await pool.end();
  }
}

beforeAll(async () => {
  await prepareDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [RolesProbeController],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: ['error'],
  });
  // Same setup as main.ts.
  const config = app.get(ConfigService);
  app.set('trust proxy', 1);
  const limit = config.get<string>('BODY_PARSER_LIMIT') ?? '1mb';
  app.useBodyParser('json', { limit });
  app.useBodyParser('urlencoded', { limit, extended: true });
  configureVersioning(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  setupSwagger(app, config, DOCS_PREFIX);
  await app.init();
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('health', () => {
  it('GET /health answers 200 in the envelope', async () => {
    const res = await http('get', '/health');
    expect(res.status).toBe(200);
    expect(dataOf<{ status: string }>(res).status).toBe('ok');
  });

  it('GET /health/ready checks DB and Redis and skips the envelope', async () => {
    const res = await http('get', '/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        checks: { database: 'up', redis: 'up' },
      }),
    );
  });
});

describe('errors and request limits', () => {
  it('answers an unknown route with COMMON_NOT_FOUND', async () => {
    const res = await http('get', '/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'COMMON_NOT_FOUND', message: 'Resource not found' },
    });
  });

  it('answers a bad body with COMMON_VALIDATION_FAILED and field details', async () => {
    const res = await http('post', '/api/v1/auth/login').send({
      email: 'invalid-email',
    });
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('COMMON_VALIDATION_FAILED');
    expect(errorOf(res).details).toEqual(
      expect.arrayContaining([
        'email must be an email',
        'password must be a string',
      ]),
    );
  });

  it('rejects unknown fields, so nobody can register as admin', async () => {
    const res = await http('post', '/api/v1/auth/register').send({
      email: newEmail('mass-assign'),
      password: 'password123',
      role: 'admin',
    });
    expect(res.status).toBe(400);
    expect(errorOf(res).details).toEqual(['property role should not exist']);
  });

  it('answers broken JSON with 400, not 500', async () => {
    const res = await http('post', '/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('COMMON_VALIDATION_FAILED');
  });

  it('answers a body over BODY_PARSER_LIMIT with 413 COMMON_PAYLOAD_TOO_LARGE', async () => {
    const res = await http('post', '/api/v1/auth/login').send({
      email: 'big@example.com',
      password: 'x'.repeat(20_000),
    });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'COMMON_PAYLOAD_TOO_LARGE',
        message: 'Request body is too large',
      },
    });
  });
});

describe('register and login', () => {
  it('registers, logs in right away and returns a safe user with role "user"', async () => {
    const { email, auth } = await register('register');
    expect(auth.accessToken).toEqual(expect.any(String));
    expect(auth.refreshToken).toEqual(expect.any(String));
    expect(auth.user.email).toBe(email);
    expect(auth.user.role).toBe('user');
    for (const secret of [
      'password',
      'refreshToken',
      'provider',
      'providerId',
      'emailVerified',
    ]) {
      expect(auth.user).not.toHaveProperty(secret);
    }
  });

  it('refuses a second account with the same email in any letter case', async () => {
    const { email } = await register('duplicate');
    const res = await http('post', '/api/v1/auth/register').send({
      email: email.toUpperCase(),
      password: 'password123',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'AUTH_EMAIL_ALREADY_IN_USE',
        message: 'Email already in use',
      },
    });
  });

  it('logs in with any letter case and rejects a wrong password', async () => {
    const { email, password } = await register('login');
    const ok = await http('post', '/api/v1/auth/login').send({
      email: email.toUpperCase(),
      password,
    });
    expectSuccess(ok);

    const bad = await http('post', '/api/v1/auth/login').send({
      email,
      password: 'wrong-password',
    });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({
      success: false,
      error: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      },
    });
  });

  it('answers an unknown email exactly like a wrong password', async () => {
    const unknown = await http('post', '/api/v1/auth/login').send({
      email: newEmail('login-unknown'),
      password: 'wrong-password',
    });
    expect(unknown.status).toBe(401);
    expect(errorOf(unknown).code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  // M2: an account switched off gets no tokens; a wrong password still looks like any wrong password.
  it('refuses a deactivated account without showing its status to a wrong password', async () => {
    const { email, password } = await register('inactive');
    await sql('UPDATE users SET is_active = false WHERE email = $1', [email]);

    const right = await http('post', '/api/v1/auth/login').send({
      email,
      password,
    });
    expect(right.status).toBe(401);
    expect(dataOf<unknown>(right)).toBeUndefined();

    const wrong = await http('post', '/api/v1/auth/login').send({
      email,
      password: 'wrong-password',
    });
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  // L4: values longer than the DB columns are a 400, never a database 500.
  it('answers too-long register fields with 400', async () => {
    const longEmail = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`;
    expect(longEmail.length).toBeGreaterThan(255);
    for (const [body, detail] of [
      [
        { email: longEmail, password: 'password123' },
        'email must be shorter than or equal to 255 characters',
      ],
      [
        {
          email: newEmail('long-first'),
          password: 'password123',
          firstName: 'x'.repeat(101),
        },
        'firstName must be shorter than or equal to 100 characters',
      ],
      [
        {
          email: newEmail('long-last'),
          password: 'password123',
          lastName: 'x'.repeat(101),
        },
        'lastName must be shorter than or equal to 100 characters',
      ],
    ] as const) {
      const res = await http('post', '/api/v1/auth/register').send(body);
      expect({ detail, status: res.status }).toEqual({ detail, status: 400 });
      expect(errorOf(res).details).toContain(detail);
    }

    const fits = await http('post', '/api/v1/auth/register').send({
      email: newEmail('long-ok'),
      password: 'password123',
      firstName: 'x'.repeat(100),
    });
    expect(fits.status).toBe(201);
  });
});

describe('JWT guard', () => {
  it('protects routes that are not @Public', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/todos'],
      ['patch', '/api/v1/auth/change-password'],
      ['post', '/api/v1/auth/logout'],
    ] as [Method, string][]) {
      const res = await http(method, path);
      expect(res.status).toBe(401);
      expect(errorOf(res).code).toBe('COMMON_UNAUTHORIZED');
    }
  });

  it('accepts an access token, but not a refresh token or a forged one', async () => {
    const { email, auth } = await register('bearer');
    const ok = await http('get', '/api/v1/todos').auth(auth.accessToken, {
      type: 'bearer',
    });
    expect(ok.status).toBe(200);

    const refreshAsBearer = await http('get', '/api/v1/todos').auth(
      auth.refreshToken,
      { type: 'bearer' },
    );
    expect(refreshAsBearer.status).toBe(401);

    const forged = await new JwtService({}).signAsync(
      { sub: auth.user.id, email, tokenType: 'access' },
      { secret: 'not-the-server-secret', expiresIn: '15m' },
    );
    const forgedRes = await http('get', '/api/v1/todos').auth(forged, {
      type: 'bearer',
    });
    expect(forgedRes.status).toBe(401);
  });
});

describe('roles (global RolesGuard + first admin seed)', () => {
  const adminEmail = () => (process.env.FIRST_ADMIN_EMAIL ?? '').toLowerCase();
  const adminPassword = () => process.env.FIRST_ADMIN_PASSWORD ?? '';

  it('seeds the first admin with role "admin" and a lowercased email', async () => {
    const admin = await login(
      process.env.FIRST_ADMIN_EMAIL ?? '',
      adminPassword(),
    );
    expect(admin.user.email).toBe(adminEmail());
    expect(admin.user.role).toBe('admin');
  });

  it('lets the admin into an @Roles(ADMIN) route', async () => {
    const admin = await login(adminEmail(), adminPassword());
    const res = await http('get', '/api/v1/e2e-roles/admin').auth(
      admin.accessToken,
      { type: 'bearer' },
    );
    expect(res.status).toBe(200);
  });

  it('answers 403 COMMON_FORBIDDEN to a normal user, 401 without a token', async () => {
    const { auth } = await register('roles');
    const forbidden = await http('get', '/api/v1/e2e-roles/admin').auth(
      auth.accessToken,
      { type: 'bearer' },
    );
    expect(forbidden.status).toBe(403);
    expect(errorOf(forbidden).code).toBe('COMMON_FORBIDDEN');

    const anyUser = await http('get', '/api/v1/e2e-roles/any').auth(
      auth.accessToken,
      { type: 'bearer' },
    );
    expect(anyUser.status).toBe(200);

    const noToken = await http('get', '/api/v1/e2e-roles/admin');
    expect(noToken.status).toBe(401);
  });

  it('fails closed on a @Public route that also has @Roles', async () => {
    const res = await http('get', '/api/v1/e2e-roles/public-admin');
    expect(res.status).toBe(403);
  });
});

describe('refresh tokens', () => {
  it('rotates on refresh and the newest token keeps working', async () => {
    const { auth } = await register('rotate-ok');
    await nextSecond();
    const first = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: auth.refreshToken,
    });
    expectSuccess(first);
    const rotated = dataOf<{ refreshToken: string }>(first).refreshToken;
    expect(rotated).not.toBe(auth.refreshToken);

    await nextSecond();
    const second = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: rotated,
    });
    expectSuccess(second);
  });

  // Correction item (HIGH): bcrypt only reads 72 bytes, and they are the same for every refresh JWT of a user.
  it('rejects the old refresh token after a rotation', async () => {
    const { auth } = await register('rotate-old');
    await nextSecond();
    const rotated = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: auth.refreshToken,
    });
    expectSuccess(rotated);

    const reuse = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: auth.refreshToken,
    });
    expect(reuse.status).toBe(401);
  });

  // L23: the swap is one UPDATE … WHERE refresh_token = old. Two parallel refreshes with one token: one wins.
  it('lets only one of two parallel refreshes with the same token win', async () => {
    const { auth } = await register('rotate-race');
    await nextSecond();

    const responses = await Promise.all(
      [1, 2, 3].map(() =>
        http('post', '/api/v1/auth/refresh').send({
          refreshToken: auth.refreshToken,
        }),
      ),
    );

    expect(responses.map((res) => res.status).sort()).toEqual([200, 401, 401]);
    const winner = responses.find((res) => res.status === 200);
    const next = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: winner
        ? dataOf<{ refreshToken: string }>(winner).refreshToken
        : '',
    });
    expectSuccess(next);
  });

  it('logout returns 204 and kills the refresh token, also after the next login', async () => {
    const { email, password, auth } = await register('logout');
    const out = await http('post', '/api/v1/auth/logout').auth(
      auth.accessToken,
      { type: 'bearer' },
    );
    expect(out.status).toBe(204);
    expect(out.text).toBe('');

    const afterLogout = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: auth.refreshToken,
    });
    expect(afterLogout.status).toBe(401);

    await nextSecond();
    await login(email, password);
    const afterNewLogin = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: auth.refreshToken,
    });
    expect(afterNewLogin.status).toBe(401);
  });
});

describe('email verification', () => {
  it('verifies with the right code once, then sends no new codes', async () => {
    const { email } = await register('verify');
    const resend = await http(
      'post',
      '/api/v1/auth/register/verify-email/resend',
    ).send({ email });
    expectSuccess(resend);
    const session = dataOf<{
      sessionToken: string;
      expiresIn: number;
      otp?: string;
    }>(resend);
    expect(session.sessionToken).not.toBe('');
    expect(session.otp).toMatch(/^\d{6}$/);

    const wrongCode = session.otp === '000000' ? '111111' : '000000';
    const wrong = await http('post', '/api/v1/auth/register/verify-email').send(
      {
        sessionToken: session.sessionToken,
        otp: wrongCode,
      },
    );
    expect(wrong.status).toBe(400);

    const ok = await http('post', '/api/v1/auth/register/verify-email').send({
      sessionToken: session.sessionToken,
      otp: session.otp,
    });
    expectSuccess(ok);
    expect(dataOf<AuthData>(ok).user.email).toBe(email);

    const replay = await http(
      'post',
      '/api/v1/auth/register/verify-email',
    ).send({ sessionToken: session.sessionToken, otp: session.otp });
    expect(replay.status).toBe(400);

    // L32: a verified email gets a session that looks real but leads nowhere, and no code.
    const again = await http(
      'post',
      '/api/v1/auth/register/verify-email/resend',
    ).send({ email });
    expectSuccess(again);
    const fake = dataOf<{ sessionToken: string; expiresIn: number }>(again);
    expect(fake).toEqual({
      sessionToken: expect.stringMatching(UUID_V4),
      expiresIn: session.expiresIn,
    });
    const nowhere = await http(
      'post',
      '/api/v1/auth/register/verify-email',
    ).send({ sessionToken: fake.sessionToken, otp: session.otp });
    expect(nowhere.status).toBe(400);
  });

  // L32: the answer has the same shape and value format for unknown, verified and unverified emails.
  it('answers unknown, verified and unverified emails with the same kind of session', async () => {
    const resend = (email: string) =>
      http('post', '/api/v1/auth/register/verify-email/resend').send({
        email,
      });
    const unverified = await register('resend-shape');
    const verified = await register('resend-shape-verified');
    await sql('UPDATE users SET email_verified = true WHERE email = $1', [
      verified.email,
    ]);

    const answers = [
      await resend(newEmail('nobody')),
      await resend(verified.email),
      await resend(unverified.email),
    ];

    for (const res of answers) expectSuccess(res);
    const [unknown, known, real] = answers.map((res) =>
      dataOf<{ sessionToken: string; expiresIn: number; otp?: string }>(res),
    );
    const looksReal = {
      sessionToken: expect.stringMatching(UUID_V4),
      expiresIn: 900,
    };
    expect(unknown).toEqual(looksReal);
    expect(known).toEqual(looksReal);
    // Only a real session has the debug-mode code (AUTH_DEBUG_RETURN_OTP is on in e2e, never in production).
    expect(real).toEqual({
      ...looksReal,
      otp: expect.stringMatching(/^\d{6}$/),
    });
    expect(
      new Set([unknown, known, real].map((s) => s?.sessionToken)).size,
    ).toBe(3);
  });

  // L4: the session token is a UUID v4, anything else is a 400 before Redis is asked.
  it('refuses a session token that is not a UUID', async () => {
    for (const sessionToken of [
      '',
      'not-a-uuid',
      '*',
      '../../x',
      'a'.repeat(5000),
    ]) {
      const res = await http('post', '/api/v1/auth/register/verify-email').send(
        { sessionToken, otp: '123456' },
      );
      expect({
        sessionToken: sessionToken.slice(0, 12),
        status: res.status,
      }).toEqual({
        sessionToken: sessionToken.slice(0, 12),
        status: 400,
      });
      expect(errorOf(res).details).toContain('sessionToken must be a UUID');
    }
  });

  type Session = { sessionToken: string; expiresIn: number; otp?: string };
  const resendFor = async (email: string): Promise<Session> =>
    dataOf<Session>(
      await http('post', '/api/v1/auth/register/verify-email/resend').send({
        email,
      }),
    );
  const verify = (sessionToken: string, otp: string) =>
    http('post', '/api/v1/auth/register/verify-email').send({
      sessionToken,
      otp,
    });
  const otherCode = (otp: string | undefined, n: number) => {
    const code = String(n).padStart(6, '0');
    return code === otp ? '999999' : code;
  };

  // L38 (run 6): unknown and verified emails get a stored session with no user, so verify counts
  // their wrong codes like a real one. Before, only a real session led to the 429 lock.
  it('counts verify-email tries the same for unknown, verified and unverified emails', async () => {
    const unverified = await register('verify-same');
    const verified = await register('verify-same-verified');
    await sql('UPDATE users SET email_verified = true WHERE email = $1', [
      verified.email,
    ]);
    const redis = app.get<Redis>(REDIS_CLIENT);
    const resend = (email: string) =>
      http('post', '/api/v1/auth/register/verify-email/resend').send({ email });

    const userIds: number[] = [];
    const runs: string[][] = [];
    for (const email of [
      newEmail('verify-same-nobody'),
      verified.email,
      unverified.email,
    ]) {
      const steps: string[] = [];
      for (let round = 0; round < 2; round += 1) {
        const answer = await resend(email);
        steps.push(`resend ${answer.status}`);
        const { sessionToken } = dataOf<Session>(answer);
        const key = AUTH_REDIS_KEYS.emailVerifySession(sessionToken);
        const stored = JSON.parse((await redis.get(key)) ?? '{}') as {
          userId?: number;
          otp?: string;
        };
        if (round === 0) userIds.push(stored.userId ?? -1);
        steps.push(`stored ${/^\d{6}$/.test(stored.otp ?? '')}`);
        for (let n = 0; n < 5; n += 1) {
          const res = await verify(sessionToken, otherCode(stored.otp, n));
          steps.push(`verify ${res.status} ${errorOf(res)?.code}`);
        }
        // The 5th wrong try burns the session, for every email.
        steps.push(`session left ${await redis.exists(key)}`);
      }
      const locked = await resend(email);
      steps.push(`resend ${locked.status} ${errorOf(locked)?.code}`);
      runs.push(steps);
    }

    expect(userIds.slice(0, 2)).toEqual([0, 0]);
    expect(userIds[2]).toBeGreaterThan(0);
    const [unknown = [], known = [], real = []] = runs;
    expect(unknown).toEqual(real);
    expect(known).toEqual(real);
    expect(real.at(-1)).toBe('resend 429 COMMON_RATE_LIMITED');
  });

  // M10: wrong codes count per email across sessions. New sessions do not reset the count.
  it('locks the email after 10 wrong codes over several sessions, even for a live right code', async () => {
    const { email } = await register('verify-lock');
    const first = await resendFor(email);
    const second = await resendFor(email);

    for (let n = 0; n < 5; n += 1) {
      expect(
        (await verify(first.sessionToken, otherCode(first.otp, n))).status,
      ).toBe(400);
    }
    for (let n = 0; n < 4; n += 1) {
      expect(
        (await verify(second.sessionToken, otherCode(second.otp, n))).status,
      ).toBe(400);
    }
    const third = await resendFor(email);
    expect(third.sessionToken).not.toBe('');
    expect(
      (await verify(second.sessionToken, otherCode(second.otp, 9))).status,
    ).toBe(400);

    const right = await verify(third.sessionToken, third.otp ?? '');
    expect(right.status).toBe(429);
    expect(errorOf(right).code).toBe('COMMON_RATE_LIMITED');
    const again = await http(
      'post',
      '/api/v1/auth/register/verify-email/resend',
    ).send({ email });
    expect(again.status).toBe(429);
  });

  // Run 4: the cap is read before a wrong code is counted, so guesses that arrive together are all compared.
  it('compares at most 10 verification codes when 30 guesses arrive at once', async () => {
    const { email } = await register('verify-burst');
    const session = await resendFor(email);

    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, n) =>
        verify(session.sessionToken, otherCode(session.otp, n)),
      ),
    );

    // Run 6: every 400 has the same text, so the session's attempts counter shows how many
    // guesses got past the per-email cap. Each of them raises it once, a burned session never does.
    const attempts = Number(
      await app
        .get<Redis>(REDIS_CLIENT)
        .get(
          AUTH_REDIS_KEYS.attempts(
            AUTH_REDIS_KEYS.emailVerifySession(session.sessionToken),
          ),
        ),
    );
    expect(attempts).toBeGreaterThan(0);
    expect(attempts).toBeLessThanOrEqual(10);
    expect(responses.filter((res) => ![400, 429].includes(res.status))).toEqual(
      [],
    );
  });

  // M12: the session is deleted before the email is marked, so parallel right codes cannot all win.
  it('lets only one of three parallel verifications with the right code win', async () => {
    const { email } = await register('verify-single-use');
    const session = await resendFor(email);

    const responses = await Promise.all(
      [1, 2, 3].map(() => verify(session.sessionToken, session.otp ?? '')),
    );

    expect(responses.map((res) => res.status).sort()).toEqual([200, 400, 400]);
  });

  // L2: the per-email resend limit (5 per minute) is a 429, even from new IPs each time.
  it('answers the 6th resend for one email with 429 COMMON_RATE_LIMITED', async () => {
    const email = newEmail('resend-limit');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await http(
        'post',
        '/api/v1/auth/register/verify-email/resend',
      ).send({ email });
      expect({ attempt, status: res.status }).toEqual({ attempt, status: 200 });
    }
    const blocked = await http(
      'post',
      '/api/v1/auth/register/verify-email/resend',
    ).send({ email });
    expect(blocked.status).toBe(429);
    expect(errorOf(blocked).code).toBe('COMMON_RATE_LIMITED');
  });
});

describe('forgot, reset and change password', () => {
  const resetCode = (email: string) =>
    app.get(RedisService).get(AUTH_REDIS_KEYS.resetPassword(email));

  it('gives the same answer for known and unknown emails', async () => {
    const { email } = await register('forgot');
    const known = await http('post', '/api/v1/auth/forgot-password').send({
      email,
    });
    const unknown = await http('post', '/api/v1/auth/forgot-password').send({
      email: newEmail('forgot-unknown'),
    });
    expectSuccess(known);
    expectSuccess(unknown);
    expect(known.body).toEqual(unknown.body);
  });

  // L2: the per-email limit (3 per minute) is a 429 for known and unknown emails alike.
  it('answers the 4th request for one email with 429 COMMON_RATE_LIMITED', async () => {
    const { email } = await register('forgot-limit');
    const unknownEmail = newEmail('forgot-limit-unknown');
    for (const target of [email, unknownEmail]) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const res = await http('post', '/api/v1/auth/forgot-password').send({
          email: target,
        });
        expect({ attempt, status: res.status }).toEqual({
          attempt,
          status: 200,
        });
      }
      const blocked = await http('post', '/api/v1/auth/forgot-password').send({
        email: target,
      });
      expect(blocked.status).toBe(429);
      expect(errorOf(blocked).code).toBe('COMMON_RATE_LIMITED');
    }
  });

  // H2: the reset code came by email, so a reset proves the email.
  it('marks the email verified after a reset', async () => {
    const { email } = await register('reset-verifies');
    const before = await sql<{ email_verified: boolean }>(
      'SELECT email_verified FROM users WHERE email = $1',
      [email],
    );
    expect(before[0]?.email_verified).toBe(false);

    await http('post', '/api/v1/auth/forgot-password').send({ email });
    const code = await resetCode(email);
    const ok = await http('post', '/api/v1/auth/reset-password').send({
      email,
      code,
      newPassword: 'new-password-9',
    });
    expectSuccess(ok);

    const after = await sql<{ email_verified: boolean }>(
      'SELECT email_verified FROM users WHERE email = $1',
      [email],
    );
    expect(after[0]?.email_verified).toBe(true);
  });

  it('resets the password with the emailed code and ends old sessions', async () => {
    const { email, password, auth } = await register('reset');
    await http('post', '/api/v1/auth/forgot-password').send({ email });
    const code = await resetCode(email);
    expect(code).toMatch(/^\d{6}$/);

    const wrong = await http('post', '/api/v1/auth/reset-password').send({
      email,
      code: code === '000000' ? '111111' : '000000',
      newPassword: 'new-password-1',
    });
    expect(wrong.status).toBe(400);

    const ok = await http('post', '/api/v1/auth/reset-password').send({
      email,
      code,
      newPassword: 'new-password-1',
    });
    expectSuccess(ok);

    const oldRefresh = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: auth.refreshToken,
    });
    expect(oldRefresh.status).toBe(401);

    const oldPassword = await http('post', '/api/v1/auth/login').send({
      email,
      password,
    });
    expect(oldPassword.status).toBe(401);

    await nextSecond();
    await login(email, 'new-password-1');
    // Correction item (HIGH): "All old refresh tokens stop working" must stay true after the next login.
    const oldRefreshLater = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: auth.refreshToken,
    });
    expect(oldRefreshLater.status).toBe(401);
  });

  /** 6-digit codes that are not the live one. */
  const wrongCodes = (live: string | null, count: number): string[] =>
    Array.from({ length: count + 1 }, (_, i) => String(i).padStart(6, '0'))
      .filter((code) => code !== live)
      .slice(0, count);

  const reset = (
    email: string,
    code: string,
    newPassword = 'attacker-pass-1',
  ) =>
    http('post', '/api/v1/auth/reset-password').send({
      email,
      code,
      newPassword,
    });

  // M10: 10 wrong codes per email per day, from any IP, then 429 for reset, forgot and resend.
  it('answers 429 after 10 wrong reset codes from 10 IPs, on reset, forgot and resend', async () => {
    const { email, password } = await register('code-lock');
    await http('post', '/api/v1/auth/forgot-password').send({ email });
    const live = await resetCode(email);

    const statuses: number[] = [];
    for (const guess of wrongCodes(live, 10)) {
      statuses.push((await reset(email, guess)).status);
    }
    expect(statuses).toEqual(Array(10).fill(400));

    for (const [label, res] of [
      ['reset', await reset(email, live ?? '')],
      [
        'forgot',
        await http('post', '/api/v1/auth/forgot-password').send({ email }),
      ],
      [
        'resend',
        await http('post', '/api/v1/auth/register/verify-email/resend').send({
          email,
        }),
      ],
    ] as const) {
      expect({ label, status: res.status, code: errorOf(res)?.code }).toEqual({
        label,
        status: 429,
        code: 'COMMON_RATE_LIMITED',
      });
    }
    await login(email, password);
  });

  it('refuses even the right live code once the email is locked', async () => {
    const { email, password } = await register('code-lock-live');
    await http('post', '/api/v1/auth/forgot-password').send({ email });
    const live = await resetCode(email);
    await app
      .get(RedisService)
      .setWithExpirySeconds(AUTH_REDIS_KEYS.codeFailures(email), '10', 60);

    const res = await reset(email, live ?? '');

    expect(res.status).toBe(429);
    await login(email, password);
  });

  // Run 4: the cap is read (GET) before a wrong code is counted (INCR), so guesses that arrive
  // together all pass it. Every 400 here is a guess the cap let through; the rest must be 429.
  it('lets at most 10 wrong reset codes past the cap when 30 guesses from 30 IPs arrive at once', async () => {
    const { email } = await register('code-burst');
    await http('post', '/api/v1/auth/forgot-password').send({ email });
    const live = await resetCode(email);

    const responses = await Promise.all(
      wrongCodes(live, 30).map((guess) => reset(email, guess)),
    );

    const passedTheCap = responses.filter((res) => res.status === 400).length;
    expect(passedTheCap).toBeLessThanOrEqual(10);
  });

  it('does not take the right code that comes after 20 wrong ones in one burst', async () => {
    const { email, password } = await register('code-burst-right');
    await http('post', '/api/v1/auth/forgot-password').send({ email });
    const live = await resetCode(email);

    const responses = await Promise.all(
      [...wrongCodes(live, 20), live ?? ''].map((guess) => reset(email, guess)),
    );

    expect(responses.at(-1)?.status).not.toBe(200);
    await login(email, password);
  });

  // M12: the code is deleted before the password changes, so only one parallel request can use it.
  it('lets only one of three parallel resets with the right code win', async () => {
    const { email } = await register('code-single-use');
    await http('post', '/api/v1/auth/forgot-password').send({ email });
    const live = (await resetCode(email)) ?? '';
    const passwords = ['first-pass-1', 'second-pass-2', 'third-pass-3'];

    const responses = await Promise.all(
      passwords.map((password) => reset(email, live, password)),
    );

    expect(responses.map((res) => res.status).sort()).toEqual([200, 400, 400]);
    const winner = passwords[responses.findIndex((res) => res.status === 200)];
    const logins = await Promise.all(
      passwords.map(
        async (password) =>
          (await http('post', '/api/v1/auth/login').send({ email, password }))
            .status,
      ),
    );
    expect(logins).toEqual(
      passwords.map((password) => (password === winner ? 200 : 401)),
    );
  });

  // L33: at most 10 code mails per email per day over forgot-password and resend, for any email.
  it('caps code mails at 10 per email per day across forgot-password and resend', async () => {
    const redis = app.get(RedisService);
    /** The per-minute limits end after a minute; deleting them skips the wait. */
    const nextMinute = async (target: string) => {
      await redis.del(AUTH_REDIS_KEYS.forgotPasswordLimit(target));
      await redis.del(AUTH_REDIS_KEYS.emailVerifyResendLimit(target));
    };
    const send = (route: 'forgot' | 'resend', target: string) =>
      http(
        'post',
        route === 'forgot'
          ? '/api/v1/auth/forgot-password'
          : '/api/v1/auth/register/verify-email/resend',
      ).send({ email: target });
    const { email } = await register('mail-cap');
    const unknownEmail = newEmail('mail-cap-unknown');

    for (const target of [email, unknownEmail]) {
      const statuses: number[] = [];
      for (let n = 0; n < 12; n += 1) {
        await nextMinute(target);
        statuses.push(
          (await send(n % 2 === 0 ? 'forgot' : 'resend', target)).status,
        );
      }
      expect({ target, statuses }).toEqual({
        target,
        statuses: [...Array(10).fill(200), 429, 429],
      });
    }

    const codeBefore = await resetCode(email);
    await nextMinute(email);
    const blocked = await send('forgot', email);
    expect(errorOf(blocked).code).toBe('COMMON_RATE_LIMITED');
    expect(await resetCode(email)).toBe(codeBefore);
    const ttl = await app
      .get<Redis>(REDIS_CLIENT)
      .ttl(AUTH_REDIS_KEYS.codeMailsPerDay(email));
    expect(ttl).toBeGreaterThan(86_000);
    expect(ttl).toBeLessThanOrEqual(86_400);
  });

  it('changes the password with the right current password only', async () => {
    const { email, password, auth } = await register('change');
    const bearer = { type: 'bearer' as const };

    const wrong = await http('patch', '/api/v1/auth/change-password')
      .auth(auth.accessToken, bearer)
      .send({ currentPassword: 'not-it', newPassword: 'new-password-2' });
    expect(wrong.status).toBe(400);

    const ok = await http('patch', '/api/v1/auth/change-password')
      .auth(auth.accessToken, bearer)
      .send({ currentPassword: password, newPassword: 'new-password-2' });
    expect(ok.status).toBe(200);

    // Correction item (MEDIUM): a password change must end the other sessions, like reset does.
    const oldRefresh = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: auth.refreshToken,
    });
    expect(oldRefresh.status).toBe(401);

    await login(email, 'new-password-2');
  });
});

describe('Google and Apple sign-in', () => {
  const google = (payload: Record<string, unknown>) =>
    http('post', '/api/v1/auth/google').send({
      idToken: fakeIdToken({ aud: 'e2e-google-client', ...payload }),
    });
  const apple = (payload: Record<string, unknown>) =>
    http('post', '/api/v1/auth/apple').send({
      idToken: fakeIdToken({ aud: 'com.example.e2e', ...payload }),
    });

  // L22: an account without a password answers like a wrong password, so it does not show it is social-only.
  it('answers a password login on a Google-only account like a wrong password', async () => {
    const email = newEmail('google-only');
    expectSuccess(
      await google({ sub: `g-${RUN}-only`, email, email_verified: true }),
    );

    const res = await http('post', '/api/v1/auth/login').send({
      email,
      password: 'any-password-1',
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      },
    });
  });

  it('refuses a Google token whose email is not verified', async () => {
    const res = await google({
      sub: `g-${RUN}-1`,
      email: newEmail('google-unverified'),
      email_verified: false,
    });
    expect(res.status).toBe(401);
  });

  it('signs in with a verified Google email, the same user every time', async () => {
    const email = newEmail('google');
    const first = await google({
      sub: `g-${RUN}-2`,
      email,
      email_verified: true,
    });
    expectSuccess(first);
    const second = await google({
      sub: `g-${RUN}-2`,
      email,
      email_verified: true,
    });
    expect(dataOf<AuthData>(second).user.id).toBe(
      dataOf<AuthData>(first).user.id,
    );
    expect(dataOf<AuthData>(first).user.role).toBe('user');
  });

  it('refuses an Apple token whose email is not verified, accepts "true"', async () => {
    const refused = await apple({
      sub: `a-${RUN}-1`,
      email: newEmail('apple-unverified'),
      email_verified: 'false',
    });
    expect(refused.status).toBe(401);

    const ok = await apple({
      sub: `a-${RUN}-2`,
      email: newEmail('apple'),
      email_verified: 'true',
    });
    expectSuccess(ok);
  });

  // Correction item (MEDIUM): an invalid ID token is the caller's fault. Today it is a 500.
  it('answers 401 (not 500) to a broken Google token', async () => {
    const res = await http('post', '/api/v1/auth/google').send({
      idToken: 'not-a-real-token',
    });
    expect(res.status).toBe(401);
  });

  // Correction item (HIGH): pre-account takeover. Registration does not prove the email,
  // and Google linking keeps the password the attacker set.
  it('does not let a password set before the owner linked Google keep working', async () => {
    const victimEmail = newEmail('victim');
    const attacker = await http('post', '/api/v1/auth/register').send({
      email: victimEmail,
      password: 'attacker-password',
    });
    expect(attacker.status).toBe(201);

    const owner = await google({
      sub: `g-${RUN}-victim`,
      email: victimEmail,
      email_verified: true,
    });
    expectSuccess(owner);

    const attackerLogin = await http('post', '/api/v1/auth/login').send({
      email: victimEmail,
      password: 'attacker-password',
    });
    expect(attackerLogin.status).toBe(401);
  });

  // H2: the attacker's refresh token from before the link must die too, not only the password.
  it('also ends the refresh token the attacker got at register time', async () => {
    const victimEmail = newEmail('victim-refresh');
    const attacker = await http('post', '/api/v1/auth/register').send({
      email: victimEmail,
      password: 'attacker-password',
    });
    const attackerRefresh = dataOf<AuthData>(attacker).refreshToken;

    expectSuccess(
      await google({
        sub: `g-${RUN}-victim-refresh`,
        email: victimEmail,
        email_verified: true,
      }),
    );

    const reuse = await http('post', '/api/v1/auth/refresh').send({
      refreshToken: attackerRefresh,
    });
    expect(reuse.status).toBe(401);
    const row = await sql<{ password: string | null; email_verified: boolean }>(
      'SELECT password, email_verified FROM users WHERE email = $1',
      [victimEmail],
    );
    expect(row[0]).toEqual({ password: null, email_verified: true });
  });

  it('keeps the password of an owner who verified the email first', async () => {
    const { email, password } = await register('owner-verified');
    const resend = await http(
      'post',
      '/api/v1/auth/register/verify-email/resend',
    ).send({ email });
    const session = dataOf<{ sessionToken: string; otp?: string }>(resend);
    expectSuccess(
      await http('post', '/api/v1/auth/register/verify-email').send({
        sessionToken: session.sessionToken,
        otp: session.otp,
      }),
    );

    expectSuccess(
      await google({
        sub: `g-${RUN}-owner-verified`,
        email,
        email_verified: true,
      }),
    );

    await login(email, password);
  });

  it('keeps a password set through the emailed reset code when Google links later', async () => {
    const email = newEmail('reset-then-link');
    await http('post', '/api/v1/auth/register').send({
      email,
      password: 'attacker-password',
    });
    await http('post', '/api/v1/auth/forgot-password').send({ email });
    const code = await app
      .get(RedisService)
      .get(AUTH_REDIS_KEYS.resetPassword(email));
    expectSuccess(
      await http('post', '/api/v1/auth/reset-password').send({
        email,
        code,
        newPassword: 'owner-password-1',
      }),
    );

    expectSuccess(
      await google({
        sub: `g-${RUN}-reset-then-link`,
        email,
        email_verified: true,
      }),
    );

    await login(email, 'owner-password-1');
    const attackerLogin = await http('post', '/api/v1/auth/login').send({
      email,
      password: 'attacker-password',
    });
    expect(attackerLogin.status).toBe(401);
  });

  // L14: Apple sends no picture, so an Apple sign-in must not wipe the Google one.
  it('keeps the Google picture and names when the same email signs in with Apple', async () => {
    const email = newEmail('picture');
    expectSuccess(
      await google({
        sub: `g-${RUN}-picture`,
        email,
        email_verified: true,
        given_name: 'Jane',
        family_name: 'Doe',
        picture: 'https://example.com/jane.png',
      }),
    );
    expectSuccess(
      await apple({
        sub: `a-${RUN}-picture`,
        email,
        email_verified: 'true',
      }),
    );

    const row = await sql<{
      picture: string | null;
      first_name: string | null;
      last_name: string | null;
      provider: string;
    }>(
      'SELECT picture, first_name, last_name, provider FROM users WHERE email = $1',
      [email],
    );
    expect(row[0]).toEqual({
      picture: 'https://example.com/jane.png',
      first_name: 'Jane',
      last_name: 'Doe',
      provider: 'apple',
    });
  });

  it('answers 401 (not 500) to a broken Apple token', async () => {
    const res = await http('post', '/api/v1/auth/apple').send({
      idToken: 'not-a-real-token',
    });
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('COMMON_UNAUTHORIZED');
  });

  // M2: social login must not issue tokens to an account an admin switched off.
  it('refuses Google sign-in for a deactivated account', async () => {
    const email = newEmail('google-inactive');
    const sub = `g-${RUN}-inactive`;
    expectSuccess(await google({ sub, email, email_verified: true }));
    await sql('UPDATE users SET is_active = false WHERE email = $1', [email]);

    const res = await google({ sub, email, email_verified: true });
    expect(res.status).toBe(401);
    expect(dataOf<unknown>(res)).toBeUndefined();
  });

  // L4: Apple names go to varchar(100) columns.
  it('answers a too-long Apple name with 400', async () => {
    const res = await http('post', '/api/v1/auth/apple').send({
      idToken: fakeIdToken({
        aud: 'com.example.e2e',
        sub: `a-${RUN}-long`,
        email: newEmail('apple-long'),
        email_verified: 'true',
      }),
      firstName: 'x'.repeat(101),
    });
    expect(res.status).toBe(400);
    expect(errorOf(res).details).toContain(
      'firstName must be shorter than or equal to 100 characters',
    );
  });
});

// L45 (run 7): the auth 400s have their own codes and texts, so clients never read "Validation failed" for them.
describe('auth error codes in the answer body', () => {
  const body = (code: string, message: string) => ({
    success: false,
    error: { code, message },
  });
  const invalidCode = body('AUTH_INVALID_CODE', 'Invalid or expired code');

  it('answers every bad email code or session with 400 AUTH_INVALID_CODE', async () => {
    const { email } = await register('codes');
    const resend = (to: string) =>
      http('post', '/api/v1/auth/register/verify-email/resend').send({
        email: to,
      });
    const verify = (sessionToken: string, otp: string) =>
      http('post', '/api/v1/auth/register/verify-email').send({
        sessionToken,
        otp,
      });
    const real = dataOf<{ sessionToken: string; otp: string }>(
      await resend(email),
    );
    const fake = dataOf<{ sessionToken: string }>(
      await resend(newEmail('codes-nobody')),
    );

    const answers = [
      await verify(
        real.sessionToken,
        real.otp === '000000' ? '111111' : '000000',
      ),
      await verify(randomUUID(), '123456'),
      await verify(fake.sessionToken, '123456'),
      await http('post', '/api/v1/auth/reset-password').send({
        email: newEmail('codes-reset'),
        code: '123456',
        newPassword: 'new-password-1',
      }),
    ];

    expect(answers.map((res) => [res.status, res.body])).toEqual(
      answers.map(() => [400, invalidCode]),
    );
  });

  it('answers a wrong current password and a Google-only account with their own codes', async () => {
    const bearer = { type: 'bearer' as const };
    const { auth } = await register('wrong-current');
    const wrong = await http('patch', '/api/v1/auth/change-password')
      .auth(auth.accessToken, bearer)
      .send({ currentPassword: 'not-it', newPassword: 'new-password-2' });

    const googleEmail = newEmail('google-change');
    const google = await http('post', '/api/v1/auth/google').send({
      idToken: fakeIdToken({
        aud: 'e2e-google-client',
        sub: `g-${RUN}-change`,
        email: googleEmail,
        email_verified: true,
      }),
    });
    expectSuccess(google);
    const social = await http('patch', '/api/v1/auth/change-password')
      .auth(dataOf<AuthData>(google).accessToken, bearer)
      .send({ currentPassword: 'any-password', newPassword: 'new-password-2' });

    expect([wrong.status, wrong.body]).toEqual([
      400,
      body('AUTH_WRONG_PASSWORD', 'Current password is incorrect'),
    ]);
    expect([social.status, social.body]).toEqual([
      400,
      body(
        'AUTH_SOCIAL_ACCOUNT',
        'This account signs in with Google or Apple and has no password',
      ),
    ]);
    const [row] = await sql<{ password: string | null }>(
      'SELECT password FROM users WHERE email = $1',
      [googleEmail],
    );
    expect(row).toEqual({ password: null });
  });

  it('lists the new auth codes in the Swagger ErrorCode schema', async () => {
    const res = await http('get', `/${DOCS_PREFIX}/docs/openapi.json`).auth(
      process.env.SWAGGER_BASIC_AUTH_USER ?? '',
      process.env.SWAGGER_BASIC_AUTH_PASSWORD ?? '',
    );
    const schemas = (
      res.body as {
        components: { schemas: Record<string, { enum?: string[] }> };
      }
    ).components.schemas;
    expect(schemas.ErrorCode?.enum).toEqual(
      expect.arrayContaining([
        'AUTH_INVALID_CODE',
        'AUTH_WRONG_PASSWORD',
        'AUTH_SOCIAL_ACCOUNT',
        'AUTH_PROVIDER_DISABLED',
      ]),
    );
  });
});

describe('auth rate limit (5/min per IP)', () => {
  it('answers the 6th login from one IP with 429 COMMON_RATE_LIMITED', async () => {
    const ip = '203.0.113.7';
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await http('post', '/api/v1/auth/login', ip).send({
        email: newEmail('limit'),
        password: 'wrong-password',
      });
      expect(res.status).toBe(401);
    }
    const blocked = await http('post', '/api/v1/auth/login', ip).send({
      email: newEmail('limit'),
      password: 'wrong-password',
    });
    expect(blocked.status).toBe(429);
    expect(errorOf(blocked).code).toBe('COMMON_RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();

    const otherIp = await http(
      'post',
      '/api/v1/auth/login',
      '203.0.113.8',
    ).send({ email: newEmail('limit'), password: 'wrong-password' });
    expect(otherIp.status).toBe(401);
  });

  it('keeps the limit per route (login used up, register still open)', async () => {
    const ip = '203.0.113.9';
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await http('post', '/api/v1/auth/login', ip).send({
        email: newEmail('limit-route'),
        password: 'wrong-password',
      });
    }
    const res = await http('post', '/api/v1/auth/register', ip).send({
      email: newEmail('limit-route'),
      password: 'password123',
    });
    expect(res.status).toBe(201);
  });
});

describe('internal API key routes', () => {
  it('needs the exact X-API-Key and ignores JWTs', async () => {
    const path = '/api/v1/internal/ping';
    expect((await http('get', path)).status).toBe(401);
    expect((await http('get', path).set('X-API-Key', 'wrong-key')).status).toBe(
      401,
    );
    const { auth } = await register('internal');
    expect(
      (await http('get', path).auth(auth.accessToken, { type: 'bearer' }))
        .status,
    ).toBe(401);

    const ok = await http('get', path).set(
      'X-API-Key',
      process.env.API_KEY ?? '',
    );
    expect(ok.status).toBe(200);
    expect(dataOf<{ status: string }>(ok).status).toBe('ok');
  });
});

describe('Swagger on the real app', () => {
  const credentials = () =>
    [
      process.env.SWAGGER_BASIC_AUTH_USER ?? '',
      process.env.SWAGGER_BASIC_AUTH_PASSWORD ?? '',
    ] as const;

  it('shows only Auth routes in the mobile document', async () => {
    const [user, pass] = credentials();
    const res = await http(
      'get',
      `/${DOCS_PREFIX}/mobile/docs/openapi.json`,
    ).auth(user, pass);
    expect(res.status).toBe(200);
    const paths = Object.keys((res.body as { paths: object }).paths);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.startsWith('/api/v1/auth/')).toBe(true);
    }
  });

  // Correction item (MEDIUM): Nest answers @Post() with 201 unless @HttpCode(200) is set.
  it('answers each auth POST with the success status its Swagger docs promise', async () => {
    const [user, pass] = credentials();
    const doc = (
      await http('get', `/${DOCS_PREFIX}/docs/openapi.json`).auth(user, pass)
    ).body as {
      paths: Record<string, { post?: { responses: Record<string, unknown> } }>;
    };
    const documented = (path: string) =>
      Object.keys(doc.paths[path]?.post?.responses ?? {}).filter((code) =>
        code.startsWith('2'),
      );

    const email = newEmail('contract');
    const registered = await http('post', '/api/v1/auth/register').send({
      email,
      password: 'password123',
    });
    const loggedIn = await http('post', '/api/v1/auth/login').send({
      email,
      password: 'password123',
    });
    const resend = await http(
      'post',
      '/api/v1/auth/register/verify-email/resend',
    ).send({ email });
    const session = dataOf<{ sessionToken: string; otp?: string }>(resend);
    const verified = await http(
      'post',
      '/api/v1/auth/register/verify-email',
    ).send({ sessionToken: session.sessionToken, otp: session.otp });
    const forgot = await http('post', '/api/v1/auth/forgot-password').send({
      email,
    });
    const code = await app
      .get(RedisService)
      .get(AUTH_REDIS_KEYS.resetPassword(email));
    const reset = await http('post', '/api/v1/auth/reset-password').send({
      email,
      code,
      newPassword: 'password456',
    });
    const relogged = await login(email, 'password456');
    const actual: Record<string, number> = {
      '/api/v1/auth/register': registered.status,
      '/api/v1/auth/login': loggedIn.status,
      '/api/v1/auth/register/verify-email/resend': resend.status,
      '/api/v1/auth/register/verify-email': verified.status,
      '/api/v1/auth/forgot-password': forgot.status,
      '/api/v1/auth/reset-password': reset.status,
      '/api/v1/auth/refresh': (
        await http('post', '/api/v1/auth/refresh').send({
          refreshToken: relogged.refreshToken,
        })
      ).status,
      '/api/v1/auth/google': (
        await http('post', '/api/v1/auth/google').send({
          idToken: fakeIdToken({
            aud: 'e2e-google-client',
            sub: `g-${RUN}-contract`,
            email: newEmail('contract-google'),
            email_verified: true,
          }),
        })
      ).status,
      '/api/v1/auth/apple': (
        await http('post', '/api/v1/auth/apple').send({
          idToken: fakeIdToken({
            aud: 'com.example.e2e',
            sub: `a-${RUN}-contract`,
            email: newEmail('contract-apple'),
            email_verified: 'true',
          }),
        })
      ).status,
      '/api/v1/auth/logout': (
        await http('post', '/api/v1/auth/logout').auth(relogged.accessToken, {
          type: 'bearer',
        })
      ).status,
    };
    expect(Object.keys(actual).sort()).toEqual(
      Object.keys(doc.paths)
        .filter((path) => doc.paths[path]?.post)
        .filter((path) => path.startsWith('/api/v1/auth/'))
        .sort(),
    );

    const mismatches = Object.entries(actual)
      .filter(([path, status]) => !documented(path).includes(String(status)))
      .map(
        ([path, status]) => `${path}: docs ${documented(path)}, got ${status}`,
      );
    expect(mismatches).toEqual([]);
  });

  // L31: the four code routes say an email can wait up to 24 hours; the other strict routes say a minute.
  it('documents the 24-hour email lock in the 429 of the four code routes', async () => {
    const [user, pass] = credentials();
    const doc = (
      await http('get', `/${DOCS_PREFIX}/docs/openapi.json`).auth(user, pass)
    ).body as {
      paths: Record<
        string,
        Record<string, { responses: Record<string, { description?: string }> }>
      >;
    };
    const tooMany = (path: string, method = 'post') =>
      doc.paths[`/api/v1/auth/${path}`]?.[method]?.responses['429']
        ?.description ?? '(none)';

    const texts = Object.fromEntries(
      [
        'register/verify-email',
        'register/verify-email/resend',
        'forgot-password',
        'reset-password',
        'register',
        'login',
        'google',
        'apple',
      ].map((path) => [path, tooMany(path)]),
    );
    texts['change-password'] = tooMany('change-password', 'patch');

    for (const path of [
      'register/verify-email',
      'register/verify-email/resend',
      'forgot-password',
      'reset-password',
    ]) {
      expect({ path, text: texts[path] }).toEqual({
        path,
        text: expect.stringMatching(/24 hours/),
      });
    }
    for (const path of [
      'register',
      'login',
      'google',
      'apple',
      'change-password',
    ]) {
      expect({ path, text: texts[path] }).toEqual({
        path,
        text: expect.stringMatching(/minute/),
      });
    }
  });

  // M5 (run 1): `<path>-yaml` was served outside the basic-auth mount.
  it('serves no document without credentials', async () => {
    for (const path of [
      `/${DOCS_PREFIX}/docs`,
      `/${DOCS_PREFIX}/docs/openapi.json`,
      `/${DOCS_PREFIX}/docs/openapi.yaml`,
      `/${DOCS_PREFIX}/docs/swagger-ui-init.js`,
      `/${DOCS_PREFIX}/mobile/docs/openapi.json`,
      `/${DOCS_PREFIX}/mobile/docs/openapi.yaml`,
      `/${DOCS_PREFIX}/docs-yaml`,
      `/${DOCS_PREFIX}/mobile/docs-yaml`,
    ]) {
      const res = await http('get', path);
      expect({ path, status: res.status }).toEqual({ path, status: 401 });
    }
  });

  it('serves the YAML document with credentials', async () => {
    const [user, pass] = credentials();
    const res = await http('get', `/${DOCS_PREFIX}/docs/openapi.yaml`).auth(
      user,
      pass,
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('/api/v1/internal/ping');
  });

  // Run 3 item (MEDIUM): Express routes ignore letter case, the basic-auth prefix check does not.
  it('does not serve the document when only the letter case changes', async () => {
    for (const path of [
      '/API/v1/docs/openapi.json',
      '/api/V1/docs/openapi.yaml',
      '/api/v1/DOCS/swagger-ui-init.js',
      '/api/v1/Mobile/docs/openapi.json',
    ]) {
      const res = await http('get', path);
      expect({
        path,
        status: res.status,
        leaked: res.text.includes('/api/v1/auth/login'),
      }).toEqual({ path, status: 401, leaked: false });
    }
  });

  // L5: the internal ping documents the envelope with PingResponseDto.
  it('documents the internal ping with the success envelope', async () => {
    const [user, pass] = credentials();
    const doc = (
      await http('get', `/${DOCS_PREFIX}/docs/openapi.json`).auth(user, pass)
    ).body as {
      paths: Record<
        string,
        {
          get?: {
            responses: Record<
              string,
              {
                content?: Record<
                  string,
                  {
                    schema?: { properties?: Record<string, { $ref?: string }> };
                  }
                >;
              }
            >;
          };
        }
      >;
      components: { schemas: Record<string, unknown> };
    };
    const schema =
      doc.paths['/api/v1/internal/ping']?.get?.responses['200']?.content?.[
        'application/json'
      ]?.schema;
    expect(schema?.properties?.data?.$ref).toBe(
      '#/components/schemas/PingResponseDto',
    );
    expect(doc.components.schemas).toHaveProperty('PingResponseDto');
    expect(doc.components.schemas).toHaveProperty('ErrorResponseDto');
  });
});

describe('request logs', () => {
  // Correction item (HIGH): pino-http logs every request header, so tokens and the API key land in the logs.
  it('never writes tokens, API keys or cookies to the request log', async () => {
    const params = app.get<Params>(PARAMS_PROVIDER_TOKEN);
    const configured = Array.isArray(params.pinoHttp)
      ? params.pinoHttp[0]
      : params.pinoHttp;
    const options: PinoHttpOptions = {
      ...(configured && !('write' in configured) ? configured : {}),
    };
    // Same options as the app, but written to memory instead of the pretty printer.
    delete options.transport;
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    const logRequest = pinoHttp(options, sink);
    const server = createServer((req, res) => {
      logRequest(req, res);
      res.setHeader('Set-Cookie', 'sid=SECRET-SET-COOKIE; HttpOnly');
      res.end('ok');
    });

    await request(server)
      .get('/api/v1/internal/ping')
      .set('Authorization', 'Bearer SECRET-ACCESS-TOKEN')
      .set('X-API-Key', 'SECRET-API-KEY')
      .set('Cookie', 'session=SECRET-COOKIE');

    const output = lines.join('\n');
    expect(output).toContain('/api/v1/internal/ping');
    expect(output).toContain('[redacted]');
    for (const secret of [
      'SECRET-ACCESS-TOKEN',
      'SECRET-API-KEY',
      'SECRET-COOKIE',
      'SECRET-SET-COOKIE',
    ]) {
      expect({ secret, logged: output.includes(secret) }).toEqual({
        secret,
        logged: false,
      });
    }
  });
});

describe('todos (template) ownership', () => {
  it('lets only the owner read, change or delete a todo', async () => {
    const owner = await register('todo-owner');
    const other = await register('todo-other');
    const ownerAuth = { type: 'bearer' as const };

    const created = await http('post', '/api/v1/todos')
      .auth(owner.auth.accessToken, ownerAuth)
      .send({ title: 'Buy milk' });
    expect(created.status).toBe(201);
    const id = dataOf<{ id: number }>(created).id;

    for (const [method, body] of [
      ['get', undefined],
      ['patch', { completed: true }],
      ['delete', undefined],
    ] as [Method, object | undefined][]) {
      const res = await http(method, `/api/v1/todos/${id}`)
        .auth(other.auth.accessToken, ownerAuth)
        .send(body);
      expect({ method, status: res.status }).toEqual({ method, status: 404 });
    }

    const mine = await http('get', `/api/v1/todos/${id}`).auth(
      owner.auth.accessToken,
      ownerAuth,
    );
    expect(mine.status).toBe(200);
    expect(dataOf<{ title: string }>(mine).title).toBe('Buy milk');
  });

  it('pages the list with meta', async () => {
    const { auth } = await register('todo-page');
    const bearer = { type: 'bearer' as const };
    for (const title of ['a', 'b', 'c']) {
      await http('post', '/api/v1/todos')
        .auth(auth.accessToken, bearer)
        .send({ title });
    }
    const res = await http(
      'get',
      '/api/v1/todos/paginated?page=2&limit=2',
    ).auth(auth.accessToken, bearer);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        meta: expect.objectContaining({
          page: 2,
          limit: 2,
          totalCount: 3,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        }),
      }),
    );
    expect(dataOf<unknown[]>(res)).toHaveLength(1);
  });

  it('answers a non-number id with 400', async () => {
    const { auth } = await register('todo-id');
    const res = await http('get', '/api/v1/todos/abc').auth(auth.accessToken, {
      type: 'bearer',
    });
    expect(res.status).toBe(400);
  });
});
