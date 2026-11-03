import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { UserRepository } from '../../../shared/database/repositories/user.repository';
import { MailQueueService } from '../../mail/queue/mail-queue.service';
import { RedisService } from '../../../shared/redis/redis.service';
import {
  AUTH_CONSTANTS,
  AUTH_OTP_DEFAULTS,
  AUTH_REDIS_KEYS,
} from '../auth.constants';
import { UserRole } from '../../../shared/database/schema/enums/user-role.enum';
import type { User } from '../../../shared/database/types/user-select.type';
import { DomainException } from '../../../shared/common/errors/domain.exception';
import { CommonErrorCode } from '../../../shared/common/errors/enums/common-error-code.enum';
import { AuthErrorCode } from '../../../shared/common/errors/enums/auth-error-code.enum';

/** The per-email limits answer 429 COMMON_RATE_LIMITED (L2), not a 400. */
const rateLimited = expect.objectContaining({
  code: CommonErrorCode.RATE_LIMITED,
  constructor: DomainException,
});

/** L45: every wrong, expired, used or foreign code or session gets the same 400 AUTH_INVALID_CODE answer. */
const invalidCode = expect.objectContaining({
  code: AuthErrorCode.INVALID_CODE,
  message: 'Invalid or expired code',
  constructor: DomainException,
});

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'user@example.com',
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
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function storedSession(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'email_verify',
    email: 'user@example.com',
    userId: 1,
    otp: '123456',
    ...overrides,
  });
}

describe('AuthService email verification', () => {
  let service: AuthService;
  const config: Record<string, string | number | undefined> = {};

  const userRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    markEmailVerified: jest.fn(),
    updateRefreshToken: jest.fn(),
  };
  const jwtService = { signAsync: jest.fn(), verify: jest.fn() };
  const configService = {
    get: jest.fn((key: string) => config[key]),
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'unit-test-secret',
        JWT_EXPIRATION: '15m',
        JWT_REFRESH_EXPIRATION: '7d',
      };
      const value = values[key];
      if (value === undefined) throw new Error(`Unknown key: ${key}`);
      return value;
    }),
  };
  const redisService = {
    incrWithTtlSeconds: jest.fn(),
    setWithExpirySeconds: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };
  const mailQueue = { enqueue: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const key of Object.keys(config)) delete config[key];
    jwtService.signAsync.mockResolvedValue('token');
    redisService.incrWithTtlSeconds.mockResolvedValue(1);
    redisService.del.mockResolvedValue(1);
    mailQueue.enqueue.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RedisService, useValue: redisService },
        { provide: MailQueueService, useValue: mailQueue },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('keeps issueEmailVerificationOtp private', () => {
    // @ts-expect-error -- private on purpose; this line fails to compile if it turns public again.
    expect(typeof service.issueEmailVerificationOtp).toBe('function');
  });

  describe('resendEmailVerification', () => {
    // L38 (run 6): unknown and verified emails get a stored session with no user (id 0) and no mail.
    it('stores a session with no user and sends no mail for an unknown email', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);

      const first = await service.resendEmailVerification('nobody@example.com');
      const second =
        await service.resendEmailVerification('nobody@example.com');

      expect(first).toEqual({
        sessionToken: expect.stringMatching(UUID_V4),
        expiresIn: AUTH_OTP_DEFAULTS.EMAIL_VERIFY_SESSION_TTL_SECONDS,
      });
      expect(second.sessionToken).not.toBe(first.sessionToken);
      expect(redisService.setWithExpirySeconds).toHaveBeenCalledTimes(2);
      const [key, raw, ttl] = redisService.setWithExpirySeconds.mock
        .calls[0] as [string, string, number];
      expect(key).toBe(AUTH_REDIS_KEYS.emailVerifySession(first.sessionToken));
      expect(JSON.parse(raw)).toEqual({
        type: 'email_verify',
        email: 'nobody@example.com',
        userId: 0,
        otp: expect.stringMatching(/^\d{6}$/),
      });
      expect(ttl).toBe(AUTH_OTP_DEFAULTS.EMAIL_VERIFY_SESSION_TTL_SECONDS);
      expect(mailQueue.enqueue).not.toHaveBeenCalled();
    });

    it('stores a session with no user for a verified email and sends no mail', async () => {
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ id: 4, emailVerified: true }),
      );

      const session = await service.resendEmailVerification('user@example.com');

      expect(session).toEqual({
        sessionToken: expect.stringMatching(UUID_V4),
        expiresIn: AUTH_OTP_DEFAULTS.EMAIL_VERIFY_SESSION_TTL_SECONDS,
      });
      const [, raw] = redisService.setWithExpirySeconds.mock.calls[0] as [
        string,
        string,
        number,
      ];
      expect(JSON.parse(raw)).toEqual(
        expect.objectContaining({ email: 'user@example.com', userId: 0 }),
      );
      expect(mailQueue.enqueue).not.toHaveBeenCalled();
    });

    it('keeps the code of a session with no user out of the answer, also in debug mode', async () => {
      config.AUTH_DEBUG_RETURN_OTP = 'true';
      config.NODE_ENV = 'development';
      userRepository.findByEmail.mockResolvedValue(undefined);

      const session =
        await service.resendEmailVerification('nobody@example.com');

      expect(session).not.toHaveProperty('otp');
    });

    it('gives the fake session the same keys, expiresIn and stored TTL as a real one, also with the TTL override', async () => {
      config.AUTH_EMAIL_VERIFY_SESSION_TTL_SECONDS = 120;
      userRepository.findByEmail.mockResolvedValueOnce(undefined);
      const fake = await service.resendEmailVerification('nobody@example.com');
      userRepository.findByEmail.mockResolvedValueOnce(buildUser());
      const real = await service.resendEmailVerification('user@example.com');

      expect(Object.keys(fake).sort()).toEqual(Object.keys(real).sort());
      expect(fake.expiresIn).toBe(120);
      expect(real.expiresIn).toBe(120);
      expect(fake.sessionToken).toMatch(UUID_V4);
      expect(real.sessionToken).toMatch(UUID_V4);
      expect(
        redisService.setWithExpirySeconds.mock.calls.map(([, , ttl]) => ttl),
      ).toEqual([120, 120]);
    });

    it('applies the per-email limit before the lookup', async () => {
      redisService.incrWithTtlSeconds.mockResolvedValue(
        AUTH_OTP_DEFAULTS.RESEND_RATE_LIMIT_MAX + 1,
      );

      const error = await service
        .resendEmailVerification(' User@Example.com ')
        .catch((caught: unknown) => caught);
      expect(error).toEqual(rateLimited);
      expect((error as HttpException).getStatus()).toBe(429);
      expect(redisService.incrWithTtlSeconds).toHaveBeenCalledWith(
        AUTH_REDIS_KEYS.emailVerifyResendLimit('user@example.com'),
        AUTH_OTP_DEFAULTS.RESEND_RATE_LIMIT_WINDOW_SECONDS,
      );
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('uses the AUTH_* env overrides when they are set', async () => {
      config.AUTH_RESEND_RATE_LIMIT_MAX = 2;
      config.AUTH_RESEND_RATE_LIMIT_WINDOW_SECONDS = 600;
      config.AUTH_EMAIL_VERIFY_SESSION_TTL_SECONDS = 120;
      redisService.incrWithTtlSeconds.mockResolvedValue(2);
      userRepository.findByEmail.mockResolvedValue(buildUser());

      const session = await service.resendEmailVerification('user@example.com');

      expect(redisService.incrWithTtlSeconds).toHaveBeenCalledWith(
        AUTH_REDIS_KEYS.emailVerifyResendLimit('user@example.com'),
        600,
      );
      expect(session?.expiresIn).toBe(120);
      const [, , ttl] = redisService.setWithExpirySeconds.mock.calls[0] as [
        string,
        string,
        number,
      ];
      expect(ttl).toBe(120);

      redisService.incrWithTtlSeconds.mockResolvedValue(3);
      await expect(
        service.resendEmailVerification('user@example.com'),
      ).rejects.toEqual(rateLimited);
    });

    it('stores a typed session, queues the mail and hides the code', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser({ id: 9 }));

      const session = await service.resendEmailVerification('user@example.com');

      expect(session?.sessionToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(session?.expiresIn).toBe(
        AUTH_OTP_DEFAULTS.EMAIL_VERIFY_SESSION_TTL_SECONDS,
      );
      expect(session).not.toHaveProperty('otp');
      const [key, raw] = redisService.setWithExpirySeconds.mock.calls[0] as [
        string,
        string,
        number,
      ];
      expect(key).toBe(
        AUTH_REDIS_KEYS.emailVerifySession(session?.sessionToken ?? ''),
      );
      const stored = JSON.parse(raw) as {
        type: string;
        userId: number;
        otp: string;
      };
      expect(stored.type).toBe('email_verify');
      expect(stored.userId).toBe(9);
      expect(stored.otp).toMatch(/^\d{6}$/);
      expect(mailQueue.enqueue).toHaveBeenCalledWith({
        template: 'verify-email',
        to: 'user@example.com',
        code: stored.otp,
      });
    });

    it('returns the code only with the debug flag outside production', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());
      config.AUTH_DEBUG_RETURN_OTP = 'true';
      config.NODE_ENV = 'development';

      const session = await service.resendEmailVerification('user@example.com');

      expect(session?.otp).toMatch(/^\d{6}$/);
    });

    it('never returns the code in production, even with the debug flag', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());
      config.AUTH_DEBUG_RETURN_OTP = 'true';
      config.NODE_ENV = 'production';

      const session = await service.resendEmailVerification('user@example.com');

      expect(session).not.toHaveProperty('otp');
    });

    it('still returns a session when the mail queue is down', async () => {
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      userRepository.findByEmail.mockResolvedValue(buildUser());
      mailQueue.enqueue.mockRejectedValue(new Error('redis down'));

      const session = await service.resendEmailVerification('user@example.com');

      expect(session?.sessionToken).toBeTruthy();
      expect(logError).toHaveBeenCalled();
      logError.mockRestore();
    });
  });

  describe('verifyEmail', () => {
    const key = AUTH_REDIS_KEYS.emailVerifySession('session');

    it('marks the email verified and logs the user in', async () => {
      redisService.get.mockResolvedValue(storedSession());
      userRepository.findById.mockResolvedValue(buildUser());

      const result = await service.verifyEmail('session', '123456');

      expect(redisService.del).toHaveBeenCalledWith(key);
      expect(userRepository.markEmailVerified).toHaveBeenCalledWith(1);
      expect(result.accessToken).toBe('token');
    });

    it('rejects an unknown or expired session', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(service.verifyEmail('session', '123456')).rejects.toEqual(
        invalidCode,
      );
    });

    it('rejects a corrupt session value', async () => {
      redisService.get.mockResolvedValue('{not json');

      await expect(service.verifyEmail('session', '123456')).rejects.toEqual(
        invalidCode,
      );
    });

    it('rejects a session made for another flow', async () => {
      redisService.get.mockResolvedValue(
        storedSession({ type: 'password_reset' }),
      );

      await expect(service.verifyEmail('session', '123456')).rejects.toEqual(
        invalidCode,
      );
      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    });

    it('counts a wrong code and keeps the session', async () => {
      redisService.get.mockResolvedValue(storedSession());
      redisService.incrWithTtlSeconds.mockResolvedValue(1);

      await expect(service.verifyEmail('session', '000000')).rejects.toEqual(
        invalidCode,
      );
      expect(redisService.incrWithTtlSeconds).toHaveBeenCalledWith(
        AUTH_REDIS_KEYS.attempts(key),
        AUTH_OTP_DEFAULTS.EMAIL_VERIFY_SESSION_TTL_SECONDS,
      );
      expect(redisService.del).not.toHaveBeenCalled();
      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    });

    // M12: the last allowed try burns the session. The attempts counter stays until its TTL.
    it('burns the session on the last allowed wrong try and keeps the attempts counter', async () => {
      redisService.get.mockResolvedValue(storedSession());
      redisService.incrWithTtlSeconds.mockImplementation(async (name: string) =>
        name === AUTH_REDIS_KEYS.attempts(key)
          ? AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS
          : 1,
      );

      await expect(service.verifyEmail('session', '000000')).rejects.toEqual(
        invalidCode,
      );
      expect(redisService.del).toHaveBeenCalledWith(key);
      expect(redisService.del).not.toHaveBeenCalledWith(
        AUTH_REDIS_KEYS.attempts(key),
      );
    });

    // M12: a request that read the session before it was burned gets no compare and no new tries.
    it('never compares a code past the last allowed try, not even the right one', async () => {
      redisService.get.mockResolvedValue(storedSession());
      redisService.incrWithTtlSeconds.mockImplementation(async (name: string) =>
        name === AUTH_REDIS_KEYS.attempts(key)
          ? AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS + 1
          : 1,
      );

      await expect(service.verifyEmail('session', '123456')).rejects.toEqual(
        invalidCode,
      );
      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('rejects a replayed session (another request used it first)', async () => {
      redisService.get.mockResolvedValue(storedSession());
      redisService.del.mockResolvedValue(0);

      await expect(service.verifyEmail('session', '123456')).rejects.toEqual(
        invalidCode,
      );
      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    });

    it('rejects when the user was deleted meanwhile', async () => {
      redisService.get.mockResolvedValue(storedSession());
      userRepository.findById.mockResolvedValue(undefined);

      await expect(service.verifyEmail('session', '123456')).rejects.toEqual(
        invalidCode,
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    // L45: one code and one text for every bad case, so L38 stays fixed over HTTP too.
    it('gives the same 400 AUTH_INVALID_CODE answer for every bad session or code', async () => {
      const answer = async (setup: () => void, otp = '123456') => {
        redisService.get.mockResolvedValue(storedSession());
        redisService.del.mockResolvedValue(1);
        redisService.incrWithTtlSeconds.mockResolvedValue(1);
        userRepository.findById.mockResolvedValue(buildUser());
        setup();
        const error = await service
          .verifyEmail('session', otp)
          .catch((caught: unknown) => caught);
        return error instanceof DomainException
          ? `${error.getStatus()} ${error.code}: ${error.message}`
          : String(error);
      };

      const answers = {
        unknownSession: await answer(() =>
          redisService.get.mockResolvedValue(null),
        ),
        corruptSession: await answer(() =>
          redisService.get.mockResolvedValue('{not json'),
        ),
        otherFlow: await answer(() =>
          redisService.get.mockResolvedValue(
            storedSession({ type: 'password_reset' }),
          ),
        ),
        wrongCode: await answer(() => undefined, '000000'),
        pastLastTry: await answer(() =>
          redisService.incrWithTtlSeconds.mockImplementation(
            async (name: string) =>
              name === AUTH_REDIS_KEYS.attempts(key)
                ? AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS + 1
                : 1,
          ),
        ),
        replayed: await answer(() => redisService.del.mockResolvedValue(0)),
        userGone: await answer(() =>
          userRepository.findById.mockResolvedValue(undefined),
        ),
        noUserSession: await answer(() => {
          redisService.get.mockResolvedValue(storedSession({ userId: 0 }));
          userRepository.findById.mockResolvedValue(undefined);
        }),
      };

      const same = '400 AUTH_INVALID_CODE: Invalid or expired code';
      expect(answers).toEqual({
        unknownSession: same,
        corruptSession: same,
        otherFlow: same,
        wrongCode: same,
        pastLastTry: same,
        replayed: same,
        userGone: same,
        noUserSession: same,
      });
      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    // Correction item: verify-email logs the user in, so it must block inactive users like login().
    it('does not issue tokens to a deactivated account', async () => {
      redisService.get.mockResolvedValue(storedSession());
      userRepository.findById.mockResolvedValue(buildUser({ isActive: false }));

      const outcome = await service
        .verifyEmail('session', '123456')
        .catch((error: unknown) => error);

      expect(outcome).toBeInstanceOf(HttpException);
      const status = (outcome as HttpException).getStatus();
      expect(status).toBe(401);
      expect((outcome as Error).message).toBe('User is not active');
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('stores the SHA-256 of the new refresh token on success', async () => {
      redisService.get.mockResolvedValue(storedSession());
      userRepository.findById.mockResolvedValue(buildUser());

      await service.verifyEmail('session', '123456');

      expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(
        1,
        expect.stringMatching(/^[0-9a-f]{64}$/),
      );
    });
  });

  // L38 (run 6): verify-email takes the same path for a session with no user, so its answers show nothing.
  describe('a session with no user in verify-email', () => {
    const values = new Map<string, string>();
    const storedCode = (token: string): string =>
      (
        JSON.parse(
          values.get(AUTH_REDIS_KEYS.emailVerifySession(token)) ?? '{}',
        ) as { otp?: string }
      ).otp ?? '';

    beforeEach(() => {
      values.clear();
      redisService.get.mockImplementation(
        async (name: string) => values.get(name) ?? null,
      );
      redisService.setWithExpirySeconds.mockImplementation(
        async (name: string, value: string) => {
          values.set(name, value);
        },
      );
      redisService.incrWithTtlSeconds.mockImplementation(
        async (name: string) => {
          const next = Number(values.get(name) ?? 0) + 1;
          values.set(name, String(next));
          return next;
        },
      );
      redisService.del.mockImplementation(async (name: string) =>
        values.delete(name) ? 1 : 0,
      );
    });

    /** Sends 6 wrong codes to one session and returns each answer. */
    async function wrongTries(token: string): Promise<string[]> {
      const code = storedCode(token);
      const answers: string[] = [];
      for (let n = 0; n < 6; n += 1) {
        const guess = String(n).padStart(6, '0');
        const error = await service
          .verifyEmail(token, guess === code ? '999999' : guess)
          .catch((caught: unknown) => caught);
        answers.push(
          error instanceof DomainException
            ? `${error.getStatus()} ${error.code}: ${error.message}`
            : String(error),
        );
      }
      return answers;
    }

    it('answers wrong codes for an unknown email exactly like for a real account', async () => {
      userRepository.findByEmail.mockResolvedValueOnce(undefined);
      const fake = await service.resendEmailVerification('nobody@example.com');
      userRepository.findByEmail.mockResolvedValueOnce(buildUser({ id: 7 }));
      const real = await service.resendEmailVerification('user@example.com');

      const fakeAnswers = await wrongTries(fake.sessionToken);
      const realAnswers = await wrongTries(real.sessionToken);

      expect(fakeAnswers).toEqual(realAnswers);
      // L45: the burned session (6th try) answers like a wrong code, so nothing tells the cases apart.
      expect(realAnswers).toEqual(
        Array<string>(6).fill('400 AUTH_INVALID_CODE: Invalid or expired code'),
      );
      expect(
        values.get(AUTH_REDIS_KEYS.codeFailures('nobody@example.com')),
      ).toBe('5');
      expect(values.get(AUTH_REDIS_KEYS.codeFailures('user@example.com'))).toBe(
        '5',
      );
    });

    it('refuses even the right code of a session with no user, and gives no tokens', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);
      userRepository.findById.mockResolvedValue(undefined);
      const fake = await service.resendEmailVerification('nobody@example.com');

      await expect(
        service.verifyEmail(fake.sessionToken, storedCode(fake.sessionToken)),
      ).rejects.toEqual(invalidCode);

      expect(userRepository.findById).toHaveBeenCalledWith(0);
      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
      // Used up like a real session after the right code.
      expect(
        values.has(AUTH_REDIS_KEYS.emailVerifySession(fake.sessionToken)),
      ).toBe(false);
    });

    it('locks an unknown email after 10 wrong codes, like a real one', async () => {
      for (const [email, user] of [
        ['nobody@example.com', undefined],
        ['user@example.com', buildUser({ id: 7 })],
      ] as const) {
        userRepository.findByEmail.mockResolvedValue(user);
        for (let round = 0; round < 2; round += 1) {
          const session = await service.resendEmailVerification(email);
          await wrongTries(session.sessionToken);
        }

        await expect(service.resendEmailVerification(email)).rejects.toEqual(
          rateLimited,
        );
        expect(values.get(AUTH_REDIS_KEYS.codeFailures(email))).toBe('10');
      }
    });
  });

  // M10: wrong codes count per email for a day, across sessions; new sessions do not reset it.
  describe('wrong-code limit per email', () => {
    const key = AUTH_REDIS_KEYS.emailVerifySession('session');
    const failuresKey = AUTH_REDIS_KEYS.codeFailures('user@example.com');
    const values = new Map<string, string>();

    beforeEach(() => {
      values.clear();
      values.set(key, storedSession());
      redisService.get.mockImplementation(
        async (name: string) => values.get(name) ?? null,
      );
      // Counters live in the same map as the session, like INCR in Redis.
      redisService.incrWithTtlSeconds.mockImplementation(
        async (name: string) => {
          const next = Number(values.get(name) ?? 0) + 1;
          values.set(name, String(next));
          return next;
        },
      );
      redisService.del.mockImplementation(async (name: string) =>
        values.delete(name) ? 1 : 0,
      );
      userRepository.findById.mockResolvedValue(buildUser());
    });

    it('counts a wrong code for the email, for one day', async () => {
      await expect(service.verifyEmail('session', '000000')).rejects.toEqual(
        invalidCode,
      );

      expect(redisService.incrWithTtlSeconds).toHaveBeenCalledWith(
        failuresKey,
        AUTH_CONSTANTS.CODE_FAILURE_WINDOW_SECONDS,
      );
      expect(values.get(failuresKey)).toBe('1');
    });

    // M12: both counters go up before the code is compared, the per-email one first.
    it('raises the email counter, then the session counter, before it compares', async () => {
      await service.verifyEmail('session', '123456');

      expect(
        redisService.incrWithTtlSeconds.mock.calls.map(([name]) => name),
      ).toEqual([failuresKey, AUTH_REDIS_KEYS.attempts(key)]);
      const lastCount = Math.max(
        ...redisService.incrWithTtlSeconds.mock.invocationCallOrder,
      );
      const firstUse = Math.min(
        ...redisService.del.mock.invocationCallOrder,
        ...userRepository.markEmailVerified.mock.invocationCallOrder,
      );
      expect(lastCount).toBeLessThan(firstUse);
    });

    // M12: the 11th try is refused by the counter itself, so parallel guesses cannot pass a stale read.
    it('stops comparing after the 10th try for the email, even with session tries left', async () => {
      values.set(failuresKey, String(AUTH_CONSTANTS.CODE_FAILURE_LIMIT - 1));

      await expect(service.verifyEmail('session', '000000')).rejects.toEqual(
        invalidCode,
      );
      await expect(service.verifyEmail('session', '123456')).rejects.toEqual(
        rateLimited,
      );

      expect(values.get(AUTH_REDIS_KEYS.attempts(key))).toBe('1');
      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('answers 429 to a locked email before it compares, also for the right code', async () => {
      values.set(failuresKey, String(AUTH_CONSTANTS.CODE_FAILURE_LIMIT));

      await expect(service.verifyEmail('session', '123456')).rejects.toEqual(
        rateLimited,
      );
      // The session keeps its tries: the email check runs first.
      expect(values.has(AUTH_REDIS_KEYS.attempts(key))).toBe(false);
      expect(values.has(key)).toBe(true);
      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('clears both counters after the right code', async () => {
      values.set(failuresKey, '3');
      values.set(AUTH_REDIS_KEYS.attempts(key), '2');

      await service.verifyEmail('session', '123456');

      expect(values.has(failuresKey)).toBe(false);
      expect(values.has(AUTH_REDIS_KEYS.attempts(key))).toBe(false);
      expect(values.has(key)).toBe(false);
    });

    it('sends no new code to a locked email', async () => {
      values.set(failuresKey, String(AUTH_CONSTANTS.CODE_FAILURE_LIMIT));
      userRepository.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.resendEmailVerification('user@example.com'),
      ).rejects.toEqual(rateLimited);
      expect(redisService.setWithExpirySeconds).not.toHaveBeenCalled();
      expect(mailQueue.enqueue).not.toHaveBeenCalled();
    });

    it('clears the email counter after the right code', async () => {
      values.set(failuresKey, '3');

      await service.verifyEmail('session', '123456');

      expect(redisService.del).toHaveBeenCalledWith(failuresKey);
    });
  });
});
