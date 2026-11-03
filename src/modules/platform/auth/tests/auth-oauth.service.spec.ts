import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from '../auth.service';
import { UserRepository } from '../../../shared/database/repositories/user.repository';
import { MailQueueService } from '../../mail/queue/mail-queue.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { AuthProvider } from '../../../shared/database/schema/enums/auth-provider.enum';
import { UserRole } from '../../../shared/database/schema/enums/user-role.enum';
import type { User } from '../../../shared/database/types/user-select.type';
import { DomainException } from '../../../shared/common/errors/domain.exception';
import { AuthErrorCode } from '../../../shared/common/errors/enums/auth-error-code.enum';

/** L45: a sign-in method that is not set up answers 400 AUTH_PROVIDER_DISABLED, not COMMON_VALIDATION_FAILED. */
const providerDisabled = expect.objectContaining({
  code: AuthErrorCode.PROVIDER_DISABLED,
  constructor: DomainException,
});

const mockGoogleVerify = jest.fn();
const mockAppleVerify = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: (...args: unknown[]) => mockGoogleVerify(...args),
  })),
}));

jest.mock('apple-signin-auth', () => ({
  __esModule: true,
  default: {
    verifyIdToken: (...args: unknown[]) => mockAppleVerify(...args),
  },
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

const GOOGLE_CLIENT_ID = 'google-client.apps.googleusercontent.com';
const APPLE_BUNDLE_ID = 'com.example.app';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 10,
    email: 'oauth@example.com',
    password: null,
    firstName: null,
    lastName: null,
    role: UserRole.USER,
    isActive: true,
    refreshToken: null,
    provider: AuthProvider.GOOGLE,
    providerId: 'sub-1',
    picture: null,
    emailVerified: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function googleTicket(payload: Record<string, unknown> | undefined) {
  return { getPayload: () => payload };
}

describe('AuthService social login', () => {
  let service: AuthService;
  const config: Record<string, string | undefined> = {};

  const userRepository = {
    upsertOAuthUser: jest.fn(),
    updateRefreshToken: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
    verify: jest.fn(),
  };
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

  beforeEach(async () => {
    jest.clearAllMocks();
    config.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
    config.APPLE_BUNDLE_ID = APPLE_BUNDLE_ID;
    jwtService.signAsync.mockResolvedValue('signed-token');
    userRepository.upsertOAuthUser.mockResolvedValue(buildUser());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RedisService, useValue: {} },
        { provide: MailQueueService, useValue: {} },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('googleLogin', () => {
    it('is off (400) when GOOGLE_CLIENT_ID is unset', async () => {
      config.GOOGLE_CLIENT_ID = undefined;

      await expect(service.googleLogin('token')).rejects.toEqual(
        providerDisabled,
      );
      expect(mockGoogleVerify).not.toHaveBeenCalled();
    });

    it('checks the token audience against our client id', async () => {
      mockGoogleVerify.mockResolvedValue(
        googleTicket({
          sub: 'g-1',
          email: 'oauth@example.com',
          email_verified: true,
        }),
      );

      await service.googleLogin('id-token');

      expect(OAuth2Client).toHaveBeenCalledWith(GOOGLE_CLIENT_ID);
      expect(mockGoogleVerify).toHaveBeenCalledWith({
        idToken: 'id-token',
        audience: GOOGLE_CLIENT_ID,
      });
    });

    it.each([
      ['false', false],
      ['missing', undefined],
      ['the string "true"', 'true'],
    ])(
      'rejects a token whose email_verified is %s',
      async (_label, emailVerified) => {
        mockGoogleVerify.mockResolvedValue(
          googleTicket({
            sub: 'g-1',
            email: 'victim@example.com',
            email_verified: emailVerified,
          }),
        );

        await expect(service.googleLogin('id-token')).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
        expect(userRepository.upsertOAuthUser).not.toHaveBeenCalled();
        expect(jwtService.signAsync).not.toHaveBeenCalled();
      },
    );

    it('rejects a token without an email or without a payload', async () => {
      mockGoogleVerify.mockResolvedValueOnce(
        googleTicket({ sub: 'g-1', email_verified: true }),
      );
      await expect(service.googleLogin('a')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      mockGoogleVerify.mockResolvedValueOnce(googleTicket(undefined));
      await expect(service.googleLogin('b')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(userRepository.upsertOAuthUser).not.toHaveBeenCalled();
    });

    it('links by a normalized, verified email and returns tokens', async () => {
      mockGoogleVerify.mockResolvedValue(
        googleTicket({
          sub: 'g-1',
          email: ' OAuth@Example.COM ',
          email_verified: true,
          given_name: 'Jane',
          family_name: 'Doe',
          picture: 'https://example.com/p.png',
        }),
      );

      const result = await service.googleLogin('id-token');

      expect(userRepository.upsertOAuthUser).toHaveBeenCalledWith({
        email: 'oauth@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        picture: 'https://example.com/p.png',
        provider: AuthProvider.GOOGLE,
        providerId: 'g-1',
        emailVerified: true,
      });
      expect(result.accessToken).toBe('signed-token');
      expect(result.user.role).toBe(UserRole.USER);
    });

    // M1: a bad token is a client error, not a 500.
    it('answers 401 when Google rejects the token, and touches no user', async () => {
      mockGoogleVerify.mockRejectedValue(
        new Error('Wrong number of segments in token'),
      );

      await expect(service.googleLogin('garbage')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(userRepository.upsertOAuthUser).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('never puts the library error text in the 401', async () => {
      mockGoogleVerify.mockRejectedValue(
        new Error(
          'Token used too late, 1700000000 > 1600000000: {"email":"x"}',
        ),
      );

      const error = await service
        .googleLogin('expired')
        .catch((caught: unknown) => caught);
      expect((error as Error).message).toBe('Invalid Token');
    });

    // M2: login() blocks inactive users, social login must too.
    it('does not issue tokens to a deactivated account', async () => {
      mockGoogleVerify.mockResolvedValue(
        googleTicket({
          sub: 'g-1',
          email: 'oauth@example.com',
          email_verified: true,
        }),
      );
      userRepository.upsertOAuthUser.mockResolvedValue(
        buildUser({ isActive: false }),
      );

      const outcome = await service
        .googleLogin('id-token')
        .catch((error: unknown) => error);

      expect(outcome).toBeInstanceOf(HttpException);
      expect((outcome as HttpException).getStatus()).toBe(401);
      expect((outcome as Error).message).toBe('User is not active');
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('stores only the SHA-256 of the refresh token', async () => {
      mockGoogleVerify.mockResolvedValue(
        googleTicket({
          sub: 'g-1',
          email: 'oauth@example.com',
          email_verified: true,
        }),
      );

      await service.googleLogin('id-token');

      expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(
        10,
        expect.stringMatching(/^[0-9a-f]{64}$/),
      );
    });
  });

  describe('appleLogin', () => {
    it('is off (400) when APPLE_BUNDLE_ID is unset', async () => {
      config.APPLE_BUNDLE_ID = undefined;

      await expect(service.appleLogin('token')).rejects.toEqual(
        providerDisabled,
      );
      expect(mockAppleVerify).not.toHaveBeenCalled();
    });

    it('checks the audience and the expiry', async () => {
      mockAppleVerify.mockResolvedValue({
        sub: 'a-1',
        email: 'oauth@example.com',
        email_verified: 'true',
      });

      await service.appleLogin('id-token');

      expect(mockAppleVerify).toHaveBeenCalledWith('id-token', {
        audience: APPLE_BUNDLE_ID,
        ignoreExpiration: false,
      });
    });

    it.each([
      ['the string "false"', 'false'],
      ['false', false],
      ['missing', undefined],
    ])(
      'rejects a token whose email_verified is %s',
      async (_label, emailVerified) => {
        mockAppleVerify.mockResolvedValue({
          sub: 'a-1',
          email: 'victim@example.com',
          email_verified: emailVerified,
        });

        await expect(service.appleLogin('id-token')).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
        expect(userRepository.upsertOAuthUser).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['the string "true"', 'true'],
      ['true', true],
    ])('accepts email_verified as %s', async (_label, emailVerified) => {
      mockAppleVerify.mockResolvedValue({
        sub: 'a-1',
        email: 'OAuth@Example.com',
        email_verified: emailVerified,
      });

      await service.appleLogin('id-token', 'Jane', 'Doe');

      expect(userRepository.upsertOAuthUser).toHaveBeenCalledWith({
        email: 'oauth@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        picture: null,
        provider: AuthProvider.APPLE,
        providerId: 'a-1',
        emailVerified: true,
      });
    });

    // M1: same as Google, a bad token must be a 401, not a 500.
    it('answers 401 when Apple rejects the token, and touches no user', async () => {
      mockAppleVerify.mockRejectedValue(new Error('jwt malformed'));

      await expect(service.appleLogin('garbage')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(userRepository.upsertOAuthUser).not.toHaveBeenCalled();
    });

    it('does not issue tokens to a deactivated account', async () => {
      mockAppleVerify.mockResolvedValue({
        sub: 'a-1',
        email: 'oauth@example.com',
        email_verified: 'true',
      });
      userRepository.upsertOAuthUser.mockResolvedValue(
        buildUser({ isActive: false }),
      );

      await expect(service.appleLogin('id-token')).rejects.toThrow(
        'User is not active',
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});
