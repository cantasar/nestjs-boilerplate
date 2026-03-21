import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type * as jwt from 'jsonwebtoken';
import { UserRepository } from '../users/user.repository';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { AUTH_CONSTANTS } from './auth.constants';

/** Safe user shape for API responses (no password, refreshToken). */
interface SafeUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Auth response with tokens and user. */
interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

/** Refresh token response. */
interface RefreshResponse {
  accessToken: string;
}

/** Register input DTO. */
interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/** Login input DTO. */
interface LoginInput {
  email: string;
  password: string;
}

/**
 * Handles authentication: registration, login, password reset, token refresh.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Registers a new user and returns tokens.
   * @param dto - Registration data
   * @returns Auth response with tokens and user
   */
  async register(dto: RegisterInput): Promise<AuthResponse> {
    const { email, password, firstName, lastName } = dto;
    const existing = await this.userRepository.findByEmail(email);
    if (existing) throw new ConflictException('Email already in use');
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      isActive: true,
    });
    if (!user) throw new InternalServerErrorException('Failed to create user');
    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toSafeUser(user),
    };
  }

  /**
   * Authenticates user and returns tokens.
   * @param dto - Login credentials
   * @returns Auth response with tokens and user
   */
  async login(dto: LoginInput): Promise<AuthResponse> {
    const { email, password } = dto;
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('User is not active');
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toSafeUser(user),
    };
  }

  /**
   * Sends OTP to email if user exists. Rate-limited.
   * @param email - User email
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return;
    const limitKey = `limit:forgot:${email}`;
    const limit = await this.redisService.incr(limitKey);
    if (limit === 1)
      await this.redisService.expire(
        limitKey,
        AUTH_CONSTANTS.FORGOT_PASSWORD_WINDOW_SECONDS,
      );
    if (limit > AUTH_CONSTANTS.FORGOT_PASSWORD_REQUESTS_LIMIT) {
      throw new BadRequestException(
        'Too many requests. Please try again later.',
      );
    }
    const code = Math.floor(
      AUTH_CONSTANTS.OTP_MIN +
        Math.random() * (AUTH_CONSTANTS.OTP_MAX - AUTH_CONSTANTS.OTP_MIN + 1),
    ).toString();
    const key = `reset_pass:${email}`;
    const ttl = this.configService.getOrThrow<number>('REDIS_TTL');
    await this.redisService.setWithExpirySeconds(key, code, ttl);
    try {
      await this.mailService.sendOtpEmail(email, code);
    } catch (error) {
      this.logger.error(
        'Mail sending failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Resets password using OTP code.
   * @param email - User email
   * @param code - OTP from email
   * @param newPassword - New password
   */
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const key = `reset_pass:${email}`;
    const storedCode = await this.redisService.get(key);
    if (!storedCode || storedCode !== code) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.updatePassword(email, hashedPassword);
    await this.redisService.del(key);
  }

  /**
   * Refreshes access token using refresh token.
   * @param refreshToken - Valid refresh token
   * @returns New access token
   */
  async refresh(refreshToken: string): Promise<RefreshResponse> {
    try {
      const payload = this.jwtService.verify<{ sub: number; email: string }>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        },
      );
      const user = await this.userRepository.findById(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');
      if (!user.refreshToken)
        throw new UnauthorizedException('Invalid refresh token');
      const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isMatch) throw new UnauthorizedException('Invalid refresh token');
      const accessToken = this.jwtService.sign(
        { sub: user.id, email: user.email },
        {
          expiresIn: this.configService.getOrThrow(
            'JWT_EXPIRATION',
          ) as jwt.SignOptions['expiresIn'],
          secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        },
      );
      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async generateTokens(
    userId: number,
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: userId, email };
    const signOptions: jwt.SignOptions & { secret: string } = {
      expiresIn: this.configService.getOrThrow(
        'JWT_EXPIRATION',
      ) as jwt.SignOptions['expiresIn'],
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
    };
    const refreshOptions = {
      ...signOptions,
      expiresIn: this.configService.getOrThrow(
        'JWT_REFRESH_EXPIRATION',
      ) as jwt.SignOptions['expiresIn'],
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, signOptions),
      this.jwtService.signAsync(payload, refreshOptions),
    ]);
    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    const hashedToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.updateRefreshToken(userId, hashedToken);
  }

  private toSafeUser(user: {
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
