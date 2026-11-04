import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import type { UserRepository } from '../../../shared/database/repositories/user.repository';
import type { MailQueueService } from '../../mail/queue/mail-queue.service';
import type { RedisService } from '../../../shared/redis/redis.service';
import {
  AUTH_CONSTANTS,
  AUTH_OTP_DEFAULTS,
  AUTH_REDIS_KEYS,
} from '../auth.constants';
import { UserRole } from '../../../shared/database/schema/enums/user-role.enum';
import type { User } from '../../../shared/database/types/user-select.type';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

// NIST SP 800-63B 5.2.2: at most 100 failed tries per account. A 6-digit code has 1,000,000 values.
const MAX_GUESSES_PER_DAY = 100;
const EMAIL = 'victim@example.com';
const MINUTES_PER_DAY = 24 * 60;

/** Redis with real TTLs on a fake clock, so a whole day runs in a second. */
class FakeRedis {
  now = 0;
  private readonly store = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  private live(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key);
  }

  async setWithExpirySeconds(
    key: string,
    value: string,
    ttl: number,
  ): Promise<void> {
    this.store.set(key, { value, expiresAt: this.now + ttl * 1000 });
  }

  async del(key: string): Promise<number> {
    return this.live(key) !== null && this.store.delete(key) ? 1 : 0;
  }

  async incrWithTtlSeconds(key: string, ttl: number): Promise<number> {
    const current = this.live(key);
    if (current === null) {
      this.store.set(key, { value: '1', expiresAt: this.now + ttl * 1000 });
      return 1;
    }
    const entry = this.store.get(key);
    const next = Number(current) + 1;
    if (entry) entry.value = String(next);
    return next;
  }
}

function victim(): User {
  return {
    id: 1,
    email: EMAIL,
    password: 'hashed',
    firstName: null,
    lastName: null,
    role: UserRole.USER,
    isActive: true,
    refreshToken: null,
    provider: null,
    providerId: null,
    picture: null,
    emailVerified: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

const wrongCode = (real: string | null) =>
  real === '000000' ? '111111' : '000000';

/** `count` different 6-digit codes, none equal to the live one. */
const wrongCodes = (live: string | null, count: number): string[] =>
  Array.from({ length: count + 1 }, (_, i) => String(i).padStart(6, '0'))
    .filter((code) => code !== live)
    .slice(0, count);

/** A wrong code that was compared with the live one answers 400; a refused one answers 429. */
const comparedGuesses = (results: PromiseSettledResult<unknown>[]) =>
  results.filter(
    (result) =>
      result.status === 'rejected' &&
      result.reason instanceof BadRequestException,
  ).length;

describe('OTP brute force over a day (one email, many IPs)', () => {
  let redis: FakeRedis;
  let service: AuthService;
  let passwordChanges: number;

  beforeEach(() => {
    redis = new FakeRedis();
    passwordChanges = 0;
    const users = {
      findByEmail: async () => victim(),
      findById: async () => victim(),
      updatePassword: async () => {
        passwordChanges += 1;
      },
      markEmailVerified: async () => undefined,
      updateRefreshToken: async () => undefined,
    };
    const config = { get: () => undefined, getOrThrow: () => 'x' };
    service = new AuthService(
      users as unknown as UserRepository,
      { signAsync: async () => 'token' } as unknown as JwtService,
      config as unknown as ConfigService,
      redis as unknown as RedisService,
      { enqueue: async () => undefined } as unknown as MailQueueService,
    );
  });

  // Run 3 item: 5 tries per reset code, but up to 3 new codes per minute, so 15 guesses a minute never stop.
  it('caps wrong password-reset codes per email per day', async () => {
    const resetKey = AUTH_REDIS_KEYS.resetPassword(EMAIL);
    let guesses = 0;
    for (let minute = 0; minute < MINUTES_PER_DAY; minute += 1) {
      redis.now = minute * 60_000;
      for (let request = 0; request < 3; request += 1) {
        const sent = await service.forgotPassword(EMAIL).then(
          () => true,
          () => false,
        );
        if (!sent) break;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const live = await redis.get(resetKey);
          if (live === null) break;
          guesses += 1;
          await service
            .resetPassword(EMAIL, wrongCode(live), 'attacker-password')
            .catch(() => undefined);
        }
      }
    }
    expect(guesses).toBeLessThanOrEqual(MAX_GUESSES_PER_DAY);
  });

  // Run 3 item: every resend makes a new session with 5 tries, and old sessions stay alive.
  // An attacker who verifies a victim's email this way also defeats the H2 fix (no password wipe on link).
  it('caps wrong email-verification codes per email per day', async () => {
    let guesses = 0;
    for (let minute = 0; minute < MINUTES_PER_DAY; minute += 1) {
      redis.now = minute * 60_000;
      for (let request = 0; request < 5; request += 1) {
        const session = await service
          .resendEmailVerification(EMAIL)
          .catch(() => null);
        if (!session) break;
        const key = AUTH_REDIS_KEYS.emailVerifySession(session.sessionToken);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const raw = await redis.get(key);
          if (raw === null) break;
          const { otp } = JSON.parse(raw) as { otp: string };
          guesses += 1;
          await service
            .verifyEmail(session.sessionToken, wrongCode(otp))
            .catch(() => undefined);
        }
      }
    }
    expect(guesses).toBeLessThanOrEqual(MAX_GUESSES_PER_DAY);
  });

  // Run 4: the limit is read (GET) before the wrong code is counted (INCR). Guesses that arrive
  // together, one per IP, all pass the GET, so the cap of 10 does not hold.
  it('compares at most the limit of reset codes when the guesses arrive at the same time', async () => {
    await service.forgotPassword(EMAIL);
    const live = await redis.get(AUTH_REDIS_KEYS.resetPassword(EMAIL));

    const results = await Promise.allSettled(
      wrongCodes(live, 30).map((code) =>
        service.resetPassword(EMAIL, code, 'attacker-password'),
      ),
    );

    expect(comparedGuesses(results)).toBeLessThanOrEqual(
      AUTH_CONSTANTS.CODE_FAILURE_LIMIT,
    );
  });

  it('refuses the right reset code that comes after the limit in one burst', async () => {
    await service.forgotPassword(EMAIL);
    const live = await redis.get(AUTH_REDIS_KEYS.resetPassword(EMAIL));
    const burst = [...wrongCodes(live, 20), live ?? ''];

    await Promise.allSettled(
      burst.map((code) =>
        service.resetPassword(EMAIL, code, 'attacker-password'),
      ),
    );

    expect(passwordChanges).toBe(0);
  });

  // Run 5 (M12 fix): every request reads the live code first, then raises the counters. The 6th
  // request still holds the live code it read, so only the per-code counter can stop it.
  it('refuses the right reset code that comes right after the per-code limit in one burst', async () => {
    await service.forgotPassword(EMAIL);
    const live = await redis.get(AUTH_REDIS_KEYS.resetPassword(EMAIL));
    const burst = [
      ...wrongCodes(live, AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS),
      live ?? '',
    ];

    const results = await Promise.allSettled(
      burst.map((code) =>
        service.resetPassword(EMAIL, code, 'attacker-password'),
      ),
    );

    expect(results.at(-1)?.status).toBe('rejected');
    expect(passwordChanges).toBe(0);
  });

  it('refuses the right verification code that comes right after the per-session limit in one burst', async () => {
    const session = await service.resendEmailVerification(EMAIL);
    const raw = await redis.get(
      AUTH_REDIS_KEYS.emailVerifySession(session.sessionToken),
    );
    const { otp } = JSON.parse(raw ?? '{}') as { otp?: string };
    const burst = [
      ...wrongCodes(otp ?? null, AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS),
      otp ?? '',
    ];

    const results = await Promise.allSettled(
      burst.map((code) => service.verifyEmail(session.sessionToken, code)),
    );

    expect(results.map((result) => result.status)).not.toContain('fulfilled');
  });

  it('lets only one of three parallel resets with the right code win', async () => {
    await service.forgotPassword(EMAIL);
    const live = (await redis.get(AUTH_REDIS_KEYS.resetPassword(EMAIL))) ?? '';

    const results = await Promise.allSettled(
      ['pass-one-1', 'pass-two-2', 'pass-three-3'].map((password) =>
        service.resetPassword(EMAIL, live, password),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(passwordChanges).toBe(1);
  });

  it('lets only one of three parallel verifications with the right code win', async () => {
    const session = await service.resendEmailVerification(EMAIL);
    const raw = await redis.get(
      AUTH_REDIS_KEYS.emailVerifySession(session.sessionToken),
    );
    const { otp } = JSON.parse(raw ?? '{}') as { otp?: string };

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => service.verifyEmail(session.sessionToken, otp ?? '')),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('compares at most the limit of verification codes when the guesses arrive at the same time', async () => {
    const session = await service.resendEmailVerification(EMAIL);
    const raw = await redis.get(
      AUTH_REDIS_KEYS.emailVerifySession(session?.sessionToken ?? ''),
    );
    const { otp } = JSON.parse(raw ?? '{}') as { otp?: string };

    const results = await Promise.allSettled(
      wrongCodes(otp ?? null, 30).map((code) =>
        service.verifyEmail(session?.sessionToken ?? '', code),
      ),
    );

    expect(comparedGuesses(results)).toBeLessThanOrEqual(
      AUTH_CONSTANTS.CODE_FAILURE_LIMIT,
    );
  });
});
