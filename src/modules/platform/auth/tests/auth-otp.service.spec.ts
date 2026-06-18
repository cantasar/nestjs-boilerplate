import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { UserRepository } from '../../../shared/database/repositories/user.repository';
import { MailQueueService } from '../../mail/queue/mail-queue.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { SMS_SENDER } from '../../sms/interfaces/sms-sender.interface';
import { AUTH_REDIS_KEYS } from '../auth.constants';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

const buildUser = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  email: 'user@example.com',
  phone: null,
  password: 'hashed',
  firstName: null,
  lastName: null,
  isActive: true,
  refreshToken: null,
  provider: null,
  providerId: null,
  picture: null,
  emailVerified: false,
  phoneVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('AuthService OTP/phone flows', () => {
  let service: AuthService;

  const mockUserRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findByPhone: jest.fn(),
    create: jest.fn(),
    updateRefreshToken: jest.fn(),
    updatePassword: jest.fn(),
    updatePasswordById: jest.fn(),
    markEmailVerified: jest.fn(),
  };
  const mockJwtService = { signAsync: jest.fn(), verify: jest.fn() };
  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'JWT_EXPIRATION') return '15m';
      if (key === 'JWT_REFRESH_EXPIRATION') return '7d';
      throw new Error(`Unknown key: ${key}`);
    }),
    get: jest.fn((_key: string): string | undefined => undefined),
  };
  const mockRedisService = {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
    setWithExpirySeconds: jest.fn(),
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
  };
  const mockMailQueue = { enqueue: jest.fn() };
  const mockSmsSender = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockJwtService.signAsync.mockResolvedValue('token');
    mockRedisService.incr.mockResolvedValue(1);
    mockRedisService.del.mockResolvedValue(1);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: MailQueueService, useValue: mockMailQueue },
        { provide: SMS_SENDER, useValue: mockSmsSender },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  describe('resendEmailVerification', () => {
    it('returns null for an unknown account (enumeration-safe)', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      expect(await service.resendEmailVerification('a@b.c')).toBeNull();
    });

    it('returns null when the account is already verified', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(
        buildUser({ emailVerified: true }),
      );
      expect(await service.resendEmailVerification('a@b.c')).toBeNull();
    });

    it('issues a session and stores it for an unverified account', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(buildUser());
      const result = await service.resendEmailVerification('user@example.com');
      expect(result?.sessionToken).toBeTruthy();
      expect(mockRedisService.setWithExpirySeconds).toHaveBeenCalled();
      expect(mockMailQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'verify-email' }),
      );
      expect(result?.otp).toBeUndefined(); // not echoed without debug flag
    });
  });

  describe('verifyEmail', () => {
    it('marks email verified and returns tokens on matching OTP', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({
          type: 'email_verify',
          email: 'user@example.com',
          userId: 1,
          otp: '123456',
        }),
      );
      mockUserRepository.findById.mockResolvedValue(buildUser());
      const result = await service.verifyEmail('session', '123456');
      expect(mockUserRepository.markEmailVerified).toHaveBeenCalledWith(1);
      expect(result).toHaveProperty('accessToken');
    });

    it('throws on a wrong session type', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ type: 'email_login', otp: '123456' }),
      );
      await expect(service.verifyEmail('session', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('burns the session after too many failed attempts', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({
          type: 'email_verify',
          email: 'user@example.com',
          userId: 1,
          otp: '123456',
        }),
      );
      mockRedisService.incr.mockResolvedValue(5); // hits default max
      await expect(service.verifyEmail('session', '000000')).rejects.toThrow(
        /Too many failed attempts/,
      );
      const key = AUTH_REDIS_KEYS.emailVerifySession('session');
      expect(mockRedisService.del).toHaveBeenCalledWith(key);
    });

    it('throws on a replayed (already used) session', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({
          type: 'email_verify',
          email: 'user@example.com',
          userId: 1,
          otp: '123456',
        }),
      );
      mockRedisService.del.mockResolvedValue(0);
      await expect(service.verifyEmail('session', '123456')).rejects.toThrow(
        /already used/,
      );
    });
  });

  describe('registerPhone', () => {
    it('throws ConflictException when the phone is taken', async () => {
      mockUserRepository.findByPhone.mockResolvedValue(buildUser());
      await expect(
        service.registerPhone('+15551234567', 'password123'),
      ).rejects.toThrow(ConflictException);
    });

    it('sends an SMS OTP and stores a register session', async () => {
      mockUserRepository.findByPhone.mockResolvedValue(undefined);
      const result = await service.registerPhone('+15551234567', 'password123');
      expect(mockSmsSender.send).toHaveBeenCalled();
      expect(mockRedisService.setWithExpirySeconds).toHaveBeenCalled();
      expect(result.sessionToken).toBeTruthy();
    });

    it('rejects a malformed phone number', async () => {
      mockUserRepository.findByPhone.mockResolvedValue(undefined);
      await expect(service.registerPhone('123', 'password123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifyPhoneRegister', () => {
    it('creates a phone-verified user and returns tokens', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({
          type: 'phone_register',
          phone: '+15551234567',
          hashedPassword: 'hashed',
          otp: '123456',
        }),
      );
      mockUserRepository.create.mockResolvedValue(
        buildUser({ email: null, phone: '+15551234567', phoneVerified: true }),
      );
      const result = await service.verifyPhoneRegister('session', '123456');
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '+15551234567',
          phoneVerified: true,
        }),
      );
      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('loginPhone', () => {
    it('throws on unknown phone', async () => {
      mockUserRepository.findByPhone.mockResolvedValue(undefined);
      await expect(
        service.loginPhone('+15551234567', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('never echoes the OTP even in debug mode', async () => {
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'AUTH_DEBUG_RETURN_OTP' ? 'true' : undefined,
      );
      mockUserRepository.findByPhone.mockResolvedValue(buildUser());
      const result = await service.loginPhone('+15551234567', 'password123');
      expect(result.otp).toBeUndefined();
      mockConfigService.get.mockImplementation((_key: string) => undefined);
    });
  });

  describe('changePassword', () => {
    it('updates the password when the current one matches', async () => {
      mockUserRepository.findById.mockResolvedValue(buildUser());
      await service.changePassword(1, 'old', 'newpassword');
      expect(mockUserRepository.updatePasswordById).toHaveBeenCalledWith(
        1,
        'hashed',
      );
    });

    it('throws when the current password is wrong', async () => {
      mockUserRepository.findById.mockResolvedValue(buildUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.changePassword(1, 'wrong', 'newpassword'),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepository.updatePasswordById).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token', async () => {
      await service.logout(1);
      expect(mockUserRepository.updateRefreshToken).toHaveBeenCalledWith(
        1,
        null,
      );
    });
  });
});
