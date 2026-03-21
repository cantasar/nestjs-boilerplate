import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UserRepository } from '../users/user.repository';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;
  const mockUserRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateRefreshToken: jest.fn(),
    updatePassword: jest.fn(),
  };
  const mockJwtService = {
    sign: jest.fn(),
    signAsync: jest.fn(),
    verify: jest.fn(),
  };
  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'JWT_EXPIRATION') return '15m';
      if (key === 'JWT_REFRESH_EXPIRATION') return '7d';
      if (key === 'REDIS_TTL') return 180;
      throw new Error(`Unknown key: ${key}`);
    }),
  };
  const mockRedisService = {
    incr: jest.fn(),
    expire: jest.fn(),
    setWithExpirySeconds: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };
  const mockMailService = {
    sendOtpEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockJwtService.signAsync.mockResolvedValue('token');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should create user and return tokens when email is unique', async () => {
      const inputDto = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };
      const expectedUser = {
        id: 1,
        email: inputDto.email,
        firstName: inputDto.firstName,
        lastName: inputDto.lastName,
        isActive: true,
        password: 'hashed',
        refreshToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.create.mockResolvedValue(expectedUser);
      mockUserRepository.updateRefreshToken.mockResolvedValue(undefined);

      const actualResult = await service.register(inputDto);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
        inputDto.email,
      );
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(actualResult).toHaveProperty('accessToken');
      expect(actualResult).toHaveProperty('refreshToken');
      expect(actualResult.user.email).toBe(inputDto.email);
    });

    it('should throw ConflictException when email exists', async () => {
      const inputDto = {
        email: 'existing@example.com',
        password: 'password123',
      };
      mockUserRepository.findByEmail.mockResolvedValue({ id: 1 });

      await expect(service.register(inputDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should normalize email before lookup and create', async () => {
      const inputDto = {
        email: '  Test@Example.COM ',
        password: 'password123',
      };
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.create.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        firstName: null,
        lastName: null,
        isActive: true,
        password: 'hashed',
        refreshToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockUserRepository.updateRefreshToken.mockResolvedValue(undefined);

      await service.register(inputDto);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
        }),
      );
    });
  });

  describe('login', () => {
    it('should return tokens when credentials are valid', async () => {
      const inputDto = { email: 'test@example.com', password: 'password123' };
      const mockUser = {
        id: 1,
        email: inputDto.email,
        password: 'hashed',
        isActive: true,
        firstName: 'John',
        lastName: 'Doe',
        refreshToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockUserRepository.updateRefreshToken.mockResolvedValue(undefined);

      const actualResult = await service.login(inputDto);

      expect(actualResult).toHaveProperty('accessToken');
      expect(actualResult).toHaveProperty('refreshToken');
      expect(actualResult.user.email).toBe(inputDto.email);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const inputDto = { email: 'unknown@example.com', password: 'pass' };
      mockUserRepository.findByEmail.mockResolvedValue(undefined);

      await expect(service.login(inputDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when password does not match', async () => {
      const inputDto = { email: 'test@example.com', password: 'wrong' };
      mockUserRepository.findByEmail.mockResolvedValue({
        id: 1,
        email: inputDto.email,
        password: 'hashed',
        isActive: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(inputDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException when code is invalid', async () => {
      mockRedisService.get.mockResolvedValue('different-code');

      await expect(
        service.resetPassword('test@example.com', 'wrong-code', 'newpass'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update password and revoke refresh token when code is valid', async () => {
      mockRedisService.get.mockResolvedValue('123456');
      mockUserRepository.findByEmail.mockResolvedValue({
        id: 3,
        email: 'test@example.com',
      });
      mockUserRepository.updatePassword.mockResolvedValue(undefined);
      mockUserRepository.updateRefreshToken.mockResolvedValue(undefined);
      mockRedisService.del.mockResolvedValue(1);

      await service.resetPassword(
        ' Test@Example.COM ',
        '123456',
        'newpassword',
      );

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(mockUserRepository.updatePassword).toHaveBeenCalledWith(
        'test@example.com',
        'hashed',
      );
      expect(mockUserRepository.updateRefreshToken).toHaveBeenCalledWith(
        3,
        null,
      );
    });
  });
});
