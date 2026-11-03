import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { UserRepository } from '../../shared/database/repositories/user.repository';
import { MailQueueService } from '../mail/queue/mail-queue.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  AUTH_CONSTANTS,
  AUTH_OTP_DEFAULTS,
  AUTH_REDIS_KEYS,
} from './auth.constants';
import { UserRole } from '../../shared/database/schema/enums/user-role.enum';
import type { User } from '../../shared/database/types/user-select.type';
import { DomainException } from '../../shared/common/errors/domain.exception';
import { AuthErrorCode } from '../../shared/common/errors/enums/auth-error-code.enum';
import { CommonErrorCode } from '../../shared/common/errors/enums/common-error-code.enum';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const hashMock = bcrypt.hash as jest.Mock;
const compareMock = bcrypt.compare as jest.Mock;

/** What the service must store for a refresh token: SHA-256 hex of the whole token. */
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** Runs a call that must fail and returns the error's status and code. */
async function failureOf(
  call: Promise<unknown>,
): Promise<{ type: string; status: number; code: string | undefined }> {
  const error = await call.then(
    () => {
      throw new Error('Expected the call to fail');
    },
    (caught: unknown) => caught,
  );
  if (!(error instanceof HttpException)) throw error;
  return {
    type: error.constructor.name,
    status: error.getStatus(),
    code: error instanceof DomainException ? error.code : undefined,
  };
}

/** L45: each auth 400 has its own code, so clients never see COMMON_VALIDATION_FAILED for them. */
const authError = (code: AuthErrorCode) => ({
  type: 'DomainException',
  status: 400,
  code,
});
const INVALID_CODE = authError(AuthErrorCode.INVALID_CODE);
const WRONG_PASSWORD = authError(AuthErrorCode.WRONG_PASSWORD);
const SOCIAL_ACCOUNT = authError(AuthErrorCode.SOCIAL_ACCOUNT);

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'user@example.com',
    password: 'stored-password-hash',
    firstName: 'Jane',
    lastName: 'Doe',
    role: UserRole.USER,
    isActive: true,
    refreshToken: 'stored-refresh-hash',
    provider: null,
    providerId: null,
    picture: null,
    emailVerified: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;

  const userRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn(),
    updatePassword: jest.fn(),
    updatePasswordById: jest.fn(),
    markEmailVerified: jest.fn(),
    upsertOAuthUser: jest.fn(),
  };
  /** The refresh hash in the fake DB row. rotateRefreshToken swaps it only when it still matches. */
  let storedRefreshHash: string | null = null;
  /** Redis values per key, so the code, the counters and the sessions never mix. */
  const redisValues = new Map<string, string>();
  const jwtService = { signAsync: jest.fn(), verify: jest.fn() };
  const config: Record<string, string | number | undefined> = {};
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
    hashMock.mockImplementation(async (value: string) => `hash(${value})`);
    compareMock.mockResolvedValue(true);
    jwtService.signAsync.mockImplementation(
      async (payload: { tokenType: string }) => `${payload.tokenType}-token`,
    );
    redisService.incrWithTtlSeconds.mockResolvedValue(1);
    redisService.del.mockResolvedValue(1);
    redisValues.clear();
    redisService.get.mockImplementation(
      async (key: string) => redisValues.get(key) ?? null,
    );
    storedRefreshHash = null;
    userRepository.rotateRefreshToken.mockImplementation(
      async (_id: number, current: string, next: string) => {
        if (storedRefreshHash !== current) return false;
        storedRefreshHash = next;
        return true;
      },
    );
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

  describe('register', () => {
    it('creates the user with a bcrypt hash and logs in right away', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);
      userRepository.create.mockResolvedValue(buildUser({ id: 7 }));

      const result = await service.register({
        email: 'user@example.com',
        password: 'password123',
        firstName: 'Jane',
      });

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          password: 'hash(password123)',
          isActive: true,
        }),
      );
      expect(hashMock).toHaveBeenCalledWith(
        'password123',
        AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
      );
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      // Only the SHA-256 of the whole refresh token is stored, never the token, never bcrypt.
      expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(
        7,
        sha256('refresh-token'),
      );
      expect(hashMock).not.toHaveBeenCalledWith(
        'refresh-token',
        expect.anything(),
      );
    });

    it('never puts the role from the request or any secret in the new user', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);
      userRepository.create.mockResolvedValue(buildUser());
      const input = {
        email: 'user@example.com',
        password: 'password123',
        role: UserRole.ADMIN,
      };

      await service.register(input);

      const created = userRepository.create.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(created).not.toHaveProperty('role');
      expect(created).not.toHaveProperty('refreshToken');
    });

    it('normalizes the email before the lookup and the insert', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);
      userRepository.create.mockResolvedValue(buildUser());

      await service.register({
        email: '  User@Example.COM ',
        password: 'password123',
      });

      expect(userRepository.findByEmail).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com' }),
      );
    });

    it('answers 409 AUTH_EMAIL_ALREADY_IN_USE when the email is taken', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());

      await expect(
        failureOf(
          service.register({
            email: 'user@example.com',
            password: 'x1234567',
          }),
        ),
      ).resolves.toEqual({
        type: 'DomainException',
        status: 409,
        code: AuthErrorCode.EMAIL_ALREADY_IN_USE,
      });
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(hashMock).not.toHaveBeenCalled();
    });

    it('returns a safe user with the role and without hashes', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);
      userRepository.create.mockResolvedValue(buildUser());

      const { user } = await service.register({
        email: 'user@example.com',
        password: 'password123',
      });

      expect(user.role).toBe(UserRole.USER);
      expect(Object.keys(user).sort()).toEqual(
        [
          'createdAt',
          'email',
          'firstName',
          'id',
          'isActive',
          'lastName',
          'role',
          'updatedAt',
        ].sort(),
      );
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());

      const result = await service.login({
        email: ' User@Example.com',
        password: 'password123',
      });

      expect(userRepository.findByEmail).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(compareMock).toHaveBeenCalledWith(
        'password123',
        'stored-password-hash',
      );
      expect(result.accessToken).toBe('access-token');
      expect(result.user).not.toHaveProperty('password');
      expect(result.user).not.toHaveProperty('refreshToken');
    });

    it('spends bcrypt time on an unknown email, then fails with AUTH_INVALID_CREDENTIALS', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);

      await expect(
        failureOf(
          service.login({ email: 'nobody@example.com', password: 'guess' }),
        ),
      ).resolves.toEqual({
        type: 'DomainException',
        status: 401,
        code: AuthErrorCode.INVALID_CREDENTIALS,
      });
      // The dummy compare hides which emails exist.
      expect(compareMock).toHaveBeenCalledWith('guess', expect.any(String));
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('builds the dummy hash once and reuses it', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);

      await service
        .login({ email: 'a@example.com', password: 'x' })
        .catch(() => undefined);
      await service
        .login({ email: 'b@example.com', password: 'y' })
        .catch(() => undefined);

      expect(hashMock).toHaveBeenCalledTimes(1);
      const [, firstHash] = compareMock.mock.calls[0] as [string, string];
      const [, secondHash] = compareMock.mock.calls[1] as [string, string];
      expect(secondHash).toBe(firstHash);
    });

    it('rejects a wrong password with AUTH_INVALID_CREDENTIALS and no tokens', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());
      compareMock.mockResolvedValue(false);

      await expect(
        failureOf(
          service.login({ email: 'user@example.com', password: 'wrong' }),
        ),
      ).resolves.toEqual({
        type: 'DomainException',
        status: 401,
        code: AuthErrorCode.INVALID_CREDENTIALS,
      });
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects an inactive user with the right password', async () => {
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ isActive: false }),
      );

      await expect(
        service.login({ email: 'user@example.com', password: 'password123' }),
      ).rejects.toThrow('User is not active');
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    // M2: the password is checked first, so a wrong password never shows that the account is off.
    it('answers an inactive user with a wrong password like any wrong password', async () => {
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ isActive: false }),
      );
      compareMock.mockResolvedValue(false);

      await expect(
        failureOf(
          service.login({ email: 'user@example.com', password: 'wrong' }),
        ),
      ).resolves.toEqual({
        type: 'DomainException',
        status: 401,
        code: AuthErrorCode.INVALID_CREDENTIALS,
      });
    });

    // L22: a social-only account looks like a wrong password: same code, same bcrypt time.
    it('answers a social-only account (no password) like a wrong password', async () => {
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ password: null }),
      );

      await expect(
        failureOf(
          service.login({ email: 'user@example.com', password: 'password123' }),
        ),
      ).resolves.toEqual({
        type: 'DomainException',
        status: 401,
        code: AuthErrorCode.INVALID_CREDENTIALS,
      });
      expect(compareMock).toHaveBeenCalledWith(
        'password123',
        expect.any(String),
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('never lets a social-only account in, even when bcrypt says yes', async () => {
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ password: null }),
      );
      compareMock.mockResolvedValue(true);

      await expect(
        failureOf(service.login({ email: 'user@example.com', password: '' })),
      ).resolves.toMatchObject({ code: AuthErrorCode.INVALID_CREDENTIALS });
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('tokens', () => {
    it('signs access and refresh tokens with their own type and expiry', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser({ id: 5 }));

      await service.login({ email: 'user@example.com', password: 'pw' });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: 5, email: 'user@example.com', tokenType: 'access' },
        expect.objectContaining({
          expiresIn: '15m',
          secret: 'unit-test-secret',
        }),
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: 5, email: 'user@example.com', tokenType: 'refresh' },
        expect.objectContaining({
          expiresIn: '7d',
          secret: 'unit-test-secret',
        }),
      );
    });

    // H1: a random jti makes every refresh token unique, even two in the same second.
    it('gives every refresh token its own random jti, and access tokens none', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());

      await service.login({ email: 'user@example.com', password: 'pw' });
      await service.login({ email: 'user@example.com', password: 'pw' });

      const calls = jwtService.signAsync.mock.calls as [
        { tokenType: string },
        Record<string, unknown>,
      ][];
      const refreshIds = calls
        .filter(([payload]) => payload.tokenType === 'refresh')
        .map(([, options]) => options.jwtid);
      expect(refreshIds).toHaveLength(2);
      for (const id of refreshIds) {
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      }
      expect(refreshIds[0]).not.toBe(refreshIds[1]);
      for (const [payload, options] of calls) {
        if (payload.tokenType === 'access') {
          expect(options).not.toHaveProperty('jwtid');
        }
      }
    });

    it('never puts the role in the token (role is read from the DB)', async () => {
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ role: UserRole.ADMIN }),
      );

      await service.login({ email: 'user@example.com', password: 'pw' });

      for (const [payload] of jwtService.signAsync.mock.calls as [
        Record<string, unknown>,
      ][]) {
        expect(payload).not.toHaveProperty('role');
      }
    });
  });

  describe('refresh', () => {
    const refreshPayload = {
      sub: 1,
      email: 'user@example.com',
      tokenType: 'refresh',
    };

    it('rejects an access token presented as a refresh token', async () => {
      jwtService.verify.mockReturnValue({
        ...refreshPayload,
        tokenType: 'access',
      });

      await expect(service.refresh('access-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it('rejects a token with a bad signature or expiry', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refresh('expired')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    // L30: a database outage is a 500 (logged by the filter), not a 401 that logs every client out.
    it('lets a database error from the user lookup through, not a 401', async () => {
      jwtService.verify.mockReturnValue(refreshPayload);
      const outage = new Error('connection terminated unexpectedly');
      userRepository.findById.mockRejectedValueOnce(outage);

      await expect(service.refresh('t')).rejects.toBe(outage);
    });

    it('lets a database error from the swap through, not a 401', async () => {
      jwtService.verify.mockReturnValue(refreshPayload);
      userRepository.findById.mockResolvedValue(
        buildUser({ refreshToken: sha256('t') }),
      );
      const outage = new Error('deadlock detected');
      userRepository.rotateRefreshToken.mockRejectedValueOnce(outage);

      await expect(service.refresh('t')).rejects.toBe(outage);
    });

    /** The DB row and the fake swap agree on the stored hash. */
    const storeHash = (hash: string | null) => {
      storedRefreshHash = hash;
      userRepository.findById.mockResolvedValue(
        buildUser({ refreshToken: hash }),
      );
    };

    it('rejects when the user is gone or inactive', async () => {
      jwtService.verify.mockReturnValue(refreshPayload);
      storedRefreshHash = sha256('t');
      userRepository.findById.mockResolvedValueOnce(undefined);
      await expect(service.refresh('t')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      userRepository.findById.mockResolvedValueOnce(
        buildUser({ isActive: false, refreshToken: sha256('t') }),
      );
      await expect(service.refresh('t')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(userRepository.rotateRefreshToken).not.toHaveBeenCalled();
      expect(storedRefreshHash).toBe(sha256('t'));
    });

    it('rejects after logout (no stored refresh token)', async () => {
      jwtService.verify.mockReturnValue(refreshPayload);
      storeHash(null);

      await expect(service.refresh('t')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(storedRefreshHash).toBeNull();
      expect(compareMock).not.toHaveBeenCalled();
    });

    it('rejects a token that does not match the stored hash', async () => {
      jwtService.verify.mockReturnValue(refreshPayload);
      storeHash(sha256('the-newest-token'));

      await expect(service.refresh('an-older-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(storedRefreshHash).toBe(sha256('the-newest-token'));
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
      // bcrypt is never used for refresh tokens any more.
      expect(compareMock).not.toHaveBeenCalled();
    });

    // H1: bcrypt read only 72 bytes. The SHA-256 covers the whole token, so a shared prefix is not enough.
    it('rejects a token that only shares the first 200 bytes with the stored one', async () => {
      const prefix = 'x'.repeat(200);
      jwtService.verify.mockReturnValue(refreshPayload);
      storeHash(sha256(`${prefix}-newest`));

      await expect(service.refresh(`${prefix}-older`)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a stored value of another format (old bcrypt hash) without a 500', async () => {
      jwtService.verify.mockReturnValue(refreshPayload);
      storeHash('$2b$12$abcdefghijklmnopqrstuv');

      await expect(service.refresh('t')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    // L23: the swap is the check. An unconditional write would let two refreshes with one token both win.
    it('rotates with a compare-and-swap on the old hash, never an unconditional write', async () => {
      jwtService.verify.mockReturnValue(refreshPayload);
      storeHash(sha256('old-refresh'));

      const result = await service.refresh('old-refresh');

      expect(jwtService.verify).toHaveBeenCalledWith('old-refresh', {
        secret: 'unit-test-secret',
      });
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(userRepository.rotateRefreshToken).toHaveBeenCalledWith(
        1,
        sha256('old-refresh'),
        sha256('refresh-token'),
      );
      expect(storedRefreshHash).toBe(sha256('refresh-token'));
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    // L23: the row read can be stale. Only the swap result counts.
    it('answers 401 when the swap finds another hash, even if the row read matched', async () => {
      jwtService.verify.mockReturnValue(refreshPayload);
      userRepository.findById.mockResolvedValue(
        buildUser({ refreshToken: sha256('old-refresh') }),
      );
      storedRefreshHash = sha256('rotated-meanwhile');

      await expect(service.refresh('old-refresh')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(storedRefreshHash).toBe(sha256('rotated-meanwhile'));
    });

    it('lets only one of two parallel refreshes with the same token win', async () => {
      jwtService.verify.mockReturnValue(refreshPayload);
      storeHash(sha256('old-refresh'));
      let issued = 0;
      jwtService.signAsync.mockImplementation(
        async (payload: { tokenType: string }) =>
          `${payload.tokenType}-token-${(issued += 1)}`,
      );

      const results = await Promise.allSettled([
        service.refresh('old-refresh'),
        service.refresh('old-refresh'),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
    });
  });

  describe('forgotPassword', () => {
    it('counts the request before the lookup, so unknown emails are limited too', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);

      await service.forgotPassword(' Nobody@Example.com ');

      expect(redisService.incrWithTtlSeconds).toHaveBeenCalledWith(
        AUTH_REDIS_KEYS.forgotPasswordLimit('nobody@example.com'),
        AUTH_CONSTANTS.FORGOT_PASSWORD_WINDOW_SECONDS,
      );
      expect(redisService.setWithExpirySeconds).not.toHaveBeenCalled();
      expect(mailQueue.enqueue).not.toHaveBeenCalled();
    });

    it('answers 429 COMMON_RATE_LIMITED when the per-email limit is passed', async () => {
      redisService.incrWithTtlSeconds.mockResolvedValue(
        AUTH_CONSTANTS.FORGOT_PASSWORD_REQUESTS_LIMIT + 1,
      );

      await expect(
        failureOf(service.forgotPassword('user@example.com')),
      ).resolves.toEqual({
        type: 'DomainException',
        status: 429,
        code: CommonErrorCode.RATE_LIMITED,
      });
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('still allows the last request inside the limit', async () => {
      redisService.incrWithTtlSeconds.mockResolvedValue(
        AUTH_CONSTANTS.FORGOT_PASSWORD_REQUESTS_LIMIT,
      );
      userRepository.findByEmail.mockResolvedValue(undefined);

      await expect(
        service.forgotPassword('user@example.com'),
      ).resolves.toBeUndefined();
    });

    it('stores a 6-digit code with the reset TTL and queues the mail', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());

      await service.forgotPassword('user@example.com');

      const [key, code, ttl] = redisService.setWithExpirySeconds.mock
        .calls[0] as [string, string, number];
      expect(key).toBe(AUTH_REDIS_KEYS.resetPassword('user@example.com'));
      expect(code).toMatch(/^\d{6}$/);
      expect(ttl).toBe(AUTH_CONSTANTS.PASSWORD_RESET_CODE_TTL_SECONDS);
      expect(mailQueue.enqueue).toHaveBeenCalledWith({
        template: 'password-reset',
        to: 'user@example.com',
        code,
      });
    });

    it('does not fail the request when the mail queue is down', async () => {
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      userRepository.findByEmail.mockResolvedValue(buildUser());
      mailQueue.enqueue.mockRejectedValue(new Error('redis down'));

      await expect(
        service.forgotPassword('user@example.com'),
      ).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalled();
      logError.mockRestore();
    });
  });

  describe('resetPassword', () => {
    const resetKey = AUTH_REDIS_KEYS.resetPassword('user@example.com');

    it('rejects a wrong code and counts the failure', async () => {
      redisValues.set(resetKey, '123456');

      await expect(
        failureOf(
          service.resetPassword('user@example.com', '654321', 'newpassword'),
        ),
      ).resolves.toEqual(INVALID_CODE);
      expect(redisService.incrWithTtlSeconds).toHaveBeenCalledWith(
        AUTH_REDIS_KEYS.attempts(resetKey),
        AUTH_CONSTANTS.PASSWORD_RESET_CODE_TTL_SECONDS,
      );
      expect(userRepository.updatePassword).not.toHaveBeenCalled();
    });

    it('rejects when no code was issued', async () => {
      await expect(
        failureOf(
          service.resetPassword('user@example.com', '123456', 'newpassword'),
        ),
      ).resolves.toEqual(INVALID_CODE);
      expect(userRepository.updatePassword).not.toHaveBeenCalled();
    });

    it('rejects a code of another length without throwing a 500', async () => {
      redisValues.set(resetKey, '123456');

      await expect(
        failureOf(
          service.resetPassword('user@example.com', '1234567', 'newpassword'),
        ),
      ).resolves.toEqual(INVALID_CODE);
    });

    // M12: the last allowed try burns the code. The attempts counter stays, so stale reads get no new tries.
    it('burns the code on the last allowed wrong try and keeps the attempts counter', async () => {
      redisValues.set(resetKey, '123456');
      redisService.incrWithTtlSeconds.mockResolvedValue(5);

      await expect(
        failureOf(
          service.resetPassword('user@example.com', '000000', 'newpassword'),
        ),
      ).resolves.toEqual(INVALID_CODE);
      expect(redisService.del).toHaveBeenCalledWith(resetKey);
      expect(redisService.del).not.toHaveBeenCalledWith(
        AUTH_REDIS_KEYS.attempts(resetKey),
      );
    });

    it('sets the new password, revokes refresh tokens and burns the code', async () => {
      redisValues.set(resetKey, '123456');
      userRepository.findByEmail.mockResolvedValue(buildUser({ id: 3 }));

      await service.resetPassword(' User@Example.COM ', '123456', 'newpass1');

      expect(userRepository.updatePassword).toHaveBeenCalledWith(
        'user@example.com',
        'hash(newpass1)',
      );
      expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(3, null);
      expect(redisService.del).toHaveBeenCalledWith(resetKey);
      expect(redisService.del).toHaveBeenCalledWith(
        AUTH_REDIS_KEYS.attempts(resetKey),
      );
    });

    // H2: the code came by email, so a reset proves the email.
    it('marks an unverified email as verified', async () => {
      redisValues.set(resetKey, '123456');
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ id: 8, emailVerified: false }),
      );

      await service.resetPassword('user@example.com', '123456', 'newpass1');

      expect(userRepository.markEmailVerified).toHaveBeenCalledWith(8);
    });

    it('does not touch an email that is already verified', async () => {
      redisValues.set(resetKey, '123456');
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ id: 8, emailVerified: true }),
      );

      await service.resetPassword('user@example.com', '123456', 'newpass1');

      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    });

    it('never marks an email verified on a wrong code', async () => {
      redisValues.set(resetKey, '123456');
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ emailVerified: false }),
      );

      await expect(
        failureOf(
          service.resetPassword('user@example.com', '000000', 'newpass1'),
        ),
      ).resolves.toEqual(INVALID_CODE);
      expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    // L45: one code and one text for every bad case, so the answer never shows which one it was.
    it('gives the same 400 AUTH_INVALID_CODE answer for every bad reset case', async () => {
      const answer = async (setup: () => void, code = '123456') => {
        redisValues.clear();
        redisService.del.mockResolvedValue(1);
        redisService.incrWithTtlSeconds.mockResolvedValue(1);
        userRepository.findByEmail.mockResolvedValue(buildUser());
        setup();
        const error = await service
          .resetPassword('user@example.com', code, 'newpass1')
          .catch((caught: unknown) => caught);
        return error instanceof DomainException
          ? `${error.getStatus()} ${error.code}: ${error.message}`
          : String(error);
      };
      const live = () => redisValues.set(resetKey, '123456');

      const answers = {
        noCode: await answer(() => undefined),
        wrongCode: await answer(live, '000000'),
        otherLength: await answer(live, '1234567'),
        // The right code after the last allowed try: a request that read the code before it burned.
        burned: await answer(() => {
          live();
          redisService.incrWithTtlSeconds.mockImplementation(
            async (key: string) =>
              key === AUTH_REDIS_KEYS.attempts(resetKey)
                ? AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS + 1
                : 1,
          );
        }),
        usedByAnotherRequest: await answer(() => {
          live();
          redisService.del.mockResolvedValue(0);
        }),
        userGone: await answer(() => {
          live();
          userRepository.findByEmail.mockResolvedValue(undefined);
        }),
      };

      const same = '400 AUTH_INVALID_CODE: Invalid or expired code';
      expect(answers).toEqual({
        noCode: same,
        wrongCode: same,
        otherLength: same,
        burned: same,
        usedByAnotherRequest: same,
        userGone: same,
      });
      expect(userRepository.updatePassword).not.toHaveBeenCalled();
    });
  });

  // M10: one counter of wrong codes per email, for a day, that new codes do not reset.
  describe('wrong-code limit per email', () => {
    const email = 'user@example.com';
    const resetKey = AUTH_REDIS_KEYS.resetPassword(email);
    const failuresKey = AUTH_REDIS_KEYS.codeFailures(email);
    const ttls = new Map<string, number>();

    beforeEach(() => {
      ttls.clear();
      redisService.incrWithTtlSeconds.mockImplementation(
        async (key: string, ttl: number) => {
          const next = Number(redisValues.get(key) ?? 0) + 1;
          redisValues.set(key, String(next));
          if (next === 1) ttls.set(key, ttl);
          return next;
        },
      );
      redisService.del.mockImplementation(async (key: string) =>
        redisValues.delete(key) ? 1 : 0,
      );
      redisService.setWithExpirySeconds.mockImplementation(
        async (key: string, value: string) => {
          redisValues.set(key, value);
        },
      );
      userRepository.findByEmail.mockResolvedValue(buildUser({ id: 3 }));
    });

    const lockEmail = () =>
      redisValues.set(failuresKey, String(AUTH_CONSTANTS.CODE_FAILURE_LIMIT));

    it('counts a wrong reset code for the email, for one day', async () => {
      redisValues.set(resetKey, '123456');

      await service
        .resetPassword(' User@Example.COM ', '000000', 'newpass1')
        .catch(() => undefined);

      expect(redisValues.get(failuresKey)).toBe('1');
      expect(ttls.get(failuresKey)).toBe(
        AUTH_CONSTANTS.CODE_FAILURE_WINDOW_SECONDS,
      );
      expect(AUTH_CONSTANTS.CODE_FAILURE_WINDOW_SECONDS).toBe(86_400);
    });

    it('also counts a wrong code when no code is live', async () => {
      await expect(
        failureOf(service.resetPassword(email, '000000', 'newpass1')),
      ).resolves.toEqual(INVALID_CODE);

      expect(redisValues.get(failuresKey)).toBe('1');
    });

    // M12: both counters go up before the code is compared, the per-email one first.
    it('raises the email counter, then the code counter, before it compares', async () => {
      redisValues.set(resetKey, '123456');

      await service.resetPassword(email, '123456', 'newpass1');

      expect(
        redisService.incrWithTtlSeconds.mock.calls.map(([key]) => key),
      ).toEqual([failuresKey, AUTH_REDIS_KEYS.attempts(resetKey)]);
      const lastCount = Math.max(
        ...redisService.incrWithTtlSeconds.mock.invocationCallOrder,
      );
      const firstUse = Math.min(
        ...redisService.del.mock.invocationCallOrder,
        ...userRepository.updatePassword.mock.invocationCallOrder,
      );
      expect(lastCount).toBeLessThan(firstUse);
    });

    // M12: the 11th try is refused by the counter itself, so parallel guesses cannot pass a stale read.
    it('stops comparing after the 10th try for the email, even with per-code tries left', async () => {
      redisValues.set(resetKey, '123456');
      redisValues.set(
        failuresKey,
        String(AUTH_CONSTANTS.CODE_FAILURE_LIMIT - 1),
      );

      await expect(
        failureOf(service.resetPassword(email, '000000', 'newpass1')),
      ).resolves.toEqual(INVALID_CODE);
      await expect(
        failureOf(service.resetPassword(email, '123456', 'newpass1')),
      ).resolves.toMatchObject({ status: 429 });

      expect(redisValues.get(AUTH_REDIS_KEYS.attempts(resetKey))).toBe('1');
      expect(userRepository.updatePassword).not.toHaveBeenCalled();
    });

    it('answers 429 to a locked email before it compares, also for the right code', async () => {
      redisValues.set(resetKey, '123456');
      lockEmail();

      await expect(
        failureOf(service.resetPassword(email, '123456', 'newpass1')),
      ).resolves.toEqual({
        type: 'DomainException',
        status: 429,
        code: CommonErrorCode.RATE_LIMITED,
      });
      // The code keeps its tries: the email check runs first.
      expect(redisValues.has(AUTH_REDIS_KEYS.attempts(resetKey))).toBe(false);
      expect(redisValues.get(resetKey)).toBe('123456');
      expect(userRepository.updatePassword).not.toHaveBeenCalled();
    });

    // M12: a request that read the code before the last try burned it is not compared.
    it('never compares a code past the last allowed try, not even the right one', async () => {
      redisValues.set(resetKey, '123456');
      redisValues.set(
        AUTH_REDIS_KEYS.attempts(resetKey),
        String(AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS),
      );

      await expect(
        failureOf(service.resetPassword(email, '123456', 'newpass1')),
      ).resolves.toEqual(INVALID_CODE);
      expect(userRepository.updatePassword).not.toHaveBeenCalled();
      expect(redisValues.has(resetKey)).toBe(false);
      expect(redisValues.get(AUTH_REDIS_KEYS.attempts(resetKey))).toBe(
        String(AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS + 1),
      );
    });

    it('gives a new code from forgot-password its own tries', async () => {
      redisValues.set(
        AUTH_REDIS_KEYS.attempts(resetKey),
        String(AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS),
      );

      await service.forgotPassword(email);
      const code = redisValues.get(resetKey) ?? '';

      expect(redisValues.has(AUTH_REDIS_KEYS.attempts(resetKey))).toBe(false);
      await expect(
        service.resetPassword(email, code, 'newpass1'),
      ).resolves.toBeUndefined();
    });

    it('lets only one of two parallel resets with the right code win', async () => {
      redisValues.set(resetKey, '123456');

      const results = await Promise.allSettled([
        service.resetPassword(email, '123456', 'first-pass'),
        service.resetPassword(email, '123456', 'second-pass'),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(userRepository.updatePassword).toHaveBeenCalledTimes(1);
    });

    it('sends no new reset code to a locked email', async () => {
      lockEmail();

      await expect(
        failureOf(service.forgotPassword(email)),
      ).resolves.toMatchObject({ status: 429 });
      expect(redisValues.has(resetKey)).toBe(false);
      expect(mailQueue.enqueue).not.toHaveBeenCalled();
    });

    it('locks only that email', async () => {
      lockEmail();
      const other = 'other@example.com';
      redisValues.set(AUTH_REDIS_KEYS.resetPassword(other), '654321');
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ id: 9, email: other }),
      );

      await expect(
        service.resetPassword(other, '654321', 'newpass1'),
      ).resolves.toBeUndefined();
    });

    it('clears the counter after a correct reset code', async () => {
      redisValues.set(resetKey, '123456');
      redisValues.set(failuresKey, '4');

      await service.resetPassword(email, '123456', 'newpass1');

      expect(redisValues.has(failuresKey)).toBe(false);
    });

    it('stops at exactly the limit when the wrong codes come one by one', async () => {
      const answers: number[] = [];
      for (
        let guess = 0;
        guess < AUTH_CONSTANTS.CODE_FAILURE_LIMIT + 3;
        guess += 1
      ) {
        redisValues.set(resetKey, '123456');
        const result = await failureOf(
          service.resetPassword(email, '000000', 'newpass1'),
        );
        answers.push(result.status);
      }

      expect(answers.filter((status) => status === 400)).toHaveLength(
        AUTH_CONSTANTS.CODE_FAILURE_LIMIT,
      );
      expect(answers.slice(AUTH_CONSTANTS.CODE_FAILURE_LIMIT)).toEqual([
        429, 429, 429,
      ]);
    });
  });

  // L33: at most 10 code mails per email per day, shared by forgot-password and resend.
  describe('daily code-mail cap', () => {
    const email = 'user@example.com';
    const mailsKey = AUTH_REDIS_KEYS.codeMailsPerDay(email);
    const ttls = new Map<string, number>();

    beforeEach(() => {
      ttls.clear();
      redisService.incrWithTtlSeconds.mockImplementation(
        async (key: string, ttl: number) => {
          const next = Number(redisValues.get(key) ?? 0) + 1;
          redisValues.set(key, String(next));
          if (next === 1) ttls.set(key, ttl);
          return next;
        },
      );
      redisService.del.mockImplementation(async (key: string) =>
        redisValues.delete(key) ? 1 : 0,
      );
      redisService.setWithExpirySeconds.mockImplementation(
        async (key: string, value: string) => {
          redisValues.set(key, value);
        },
      );
    });

    /** The per-minute limits reset after a minute; this skips the wait. */
    const nextMinute = (target: string) => {
      redisValues.delete(AUTH_REDIS_KEYS.forgotPasswordLimit(target));
      redisValues.delete(AUTH_REDIS_KEYS.emailVerifyResendLimit(target));
    };

    it('counts every forgot-password and resend for one day, also for unknown emails', async () => {
      userRepository.findByEmail.mockResolvedValue(undefined);

      await service.forgotPassword(' Nobody@Example.com ');
      await service.resendEmailVerification('nobody@example.com');

      expect(
        redisValues.get(AUTH_REDIS_KEYS.codeMailsPerDay('nobody@example.com')),
      ).toBe('2');
      expect(
        ttls.get(AUTH_REDIS_KEYS.codeMailsPerDay('nobody@example.com')),
      ).toBe(86_400);
    });

    it('answers the 11th code mail of the day with 429 and sends nothing, across both routes', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());
      const calls = [
        ...Array.from({ length: 5 }, () => () => service.forgotPassword(email)),
        ...Array.from(
          { length: 5 },
          () => () => service.resendEmailVerification(email),
        ),
      ];
      for (const call of calls) {
        nextMinute(email);
        await call();
      }
      expect(mailQueue.enqueue).toHaveBeenCalledTimes(10);
      const codeBefore = redisValues.get(AUTH_REDIS_KEYS.resetPassword(email));

      nextMinute(email);
      await expect(failureOf(service.forgotPassword(email))).resolves.toEqual({
        type: 'DomainException',
        status: 429,
        code: CommonErrorCode.RATE_LIMITED,
      });
      nextMinute(email);
      await expect(
        failureOf(service.resendEmailVerification(email)),
      ).resolves.toMatchObject({ status: 429 });

      expect(mailQueue.enqueue).toHaveBeenCalledTimes(10);
      expect(redisValues.get(AUTH_REDIS_KEYS.resetPassword(email))).toBe(
        codeBefore,
      );
      expect(redisValues.get(mailsKey)).toBe('12');
    });

    it('checks the cap before the user lookup', async () => {
      redisValues.set(mailsKey, String(AUTH_CONSTANTS.CODE_MAILS_PER_DAY));

      await expect(
        failureOf(service.forgotPassword(email)),
      ).resolves.toMatchObject({ status: 429 });
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('keeps each email apart', async () => {
      redisValues.set(mailsKey, String(AUTH_CONSTANTS.CODE_MAILS_PER_DAY));
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ email: 'other@example.com' }),
      );

      await expect(
        service.forgotPassword('other@example.com'),
      ).resolves.toBeUndefined();
      expect(mailQueue.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('changePassword', () => {
    it('updates the password when the current one matches', async () => {
      userRepository.findById.mockResolvedValue(buildUser());

      await service.changePassword(1, 'old-password', 'new-password');

      expect(compareMock).toHaveBeenCalledWith(
        'old-password',
        'stored-password-hash',
      );
      expect(userRepository.updatePasswordById).toHaveBeenCalledWith(
        1,
        'hash(new-password)',
      );
    });

    it('rejects a wrong current password', async () => {
      userRepository.findById.mockResolvedValue(buildUser());
      compareMock.mockResolvedValue(false);

      await expect(
        failureOf(service.changePassword(1, 'wrong', 'new-password')),
      ).resolves.toEqual(WRONG_PASSWORD);
      expect(userRepository.updatePasswordById).not.toHaveBeenCalled();
    });

    it('rejects a social-only account', async () => {
      userRepository.findById.mockResolvedValue(buildUser({ password: null }));

      await expect(
        failureOf(service.changePassword(1, 'any', 'new-password')),
      ).resolves.toEqual(SOCIAL_ACCOUNT);
      expect(userRepository.updatePasswordById).not.toHaveBeenCalled();
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    // L45: the client gets text it can show, not "Validation failed".
    it('tells a wrong current password and a social-only account apart in the message', async () => {
      userRepository.findById.mockResolvedValueOnce(buildUser());
      compareMock.mockResolvedValueOnce(false);
      const wrong = await service
        .changePassword(1, 'wrong', 'new-password')
        .catch((caught: unknown) => caught);
      userRepository.findById.mockResolvedValueOnce(
        buildUser({ password: null }),
      );
      const social = await service
        .changePassword(1, 'any', 'new-password')
        .catch((caught: unknown) => caught);

      expect([wrong, social].map((error) => (error as Error).message)).toEqual([
        'Current password is incorrect',
        'This account signs in with Google or Apple and has no password',
      ]);
    });

    it('rejects an unknown user', async () => {
      userRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.changePassword(99, 'any', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // Correction item: a password change must end the other sessions, like reset does.
    it('revokes the stored refresh token after a password change', async () => {
      userRepository.findById.mockResolvedValue(buildUser({ id: 4 }));

      await service.changePassword(4, 'old-password', 'new-password');

      expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(4, null);
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token', async () => {
      await service.logout(1);
      expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(1, null);
    });
  });
});
