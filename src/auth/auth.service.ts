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
import { randomInt } from 'crypto';
import type * as jwt from 'jsonwebtoken';
import { UserRepository } from '../users/user.repository';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { AUTH_CONSTANTS } from './auth.constants';
import { UpsertOAuthUser } from '../database/types';
import { OAuth2Client } from 'google-auth-library';
import { AuthProvider } from '../users/enums/auth-provider.enum';
import appleSignin from 'apple-signin-auth';

interface SafeUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

interface RefreshResponse {
  accessToken: string;
}

interface JwtPayload {
  sub: number;
  email: string;
}

interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private googleClient: OAuth2Client | null = null;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterInput): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) throw new ConflictException('Email already in use');
    const hashedPassword = await bcrypt.hash(
      dto.password,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );
    const user = await this.userRepository.create({
      email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
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

  async login(dto: LoginInput): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('User is not active');
    if (!user.password)
      throw new UnauthorizedException('This account uses social login');
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toSafeUser(user),
    };
  }

  async googleLogin(idToken: string): Promise<AuthResponse> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId)
      throw new BadRequestException('Google login is not configured');
    if (!this.googleClient) this.googleClient = new OAuth2Client(clientId);
    const ticket = await this.googleClient.verifyIdToken({ idToken });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new UnauthorizedException('Invalid Token');

    const user: UpsertOAuthUser = {
      email: payload.email,
      firstName: payload.given_name,
      lastName: payload.family_name,
      picture: payload.picture,
      provider: AuthProvider.GOOGLE,
      providerId: payload.sub,
      emailVerified: true,
    };

    return this.oauthLogin(user);
  }

  async appleLogin(
    idToken: string,
    firstName?: string,
    lastName?: string,
  ): Promise<AuthResponse> {
    const bundleId = this.configService.get<string>('APPLE_BUNDLE_ID');
    if (!bundleId)
      throw new BadRequestException('Apple login is not configured');
    const payload = await appleSignin.verifyIdToken(idToken, {
      audience: bundleId,
      ignoreExpiration: false,
    });

    if (!payload?.email) throw new UnauthorizedException('Invalid Token');

    const user: UpsertOAuthUser = {
      email: payload.email,
      firstName,
      lastName,
      picture: null,
      provider: AuthProvider.APPLE,
      providerId: payload.sub,
      emailVerified: true,
    };

    return this.oauthLogin(user);
  }

  async forgotPassword(rawEmail: string): Promise<void> {
    const email = this.normalizeEmail(rawEmail);
    const user = await this.userRepository.findByEmail(email);
    if (!user) return;
    await this.ensureForgotPasswordRateLimit(email);
    const code = this.generateOtpCode();
    const key = this.getResetPasswordKey(email);
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

  async resetPassword(
    rawEmail: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const email = this.normalizeEmail(rawEmail);
    const key = this.getResetPasswordKey(email);
    const storedCode = await this.redisService.get(key);
    if (!storedCode || storedCode !== code) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    const hashedPassword = await bcrypt.hash(
      newPassword,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );
    await this.userRepository.updatePassword(email, hashedPassword);
    await this.userRepository.updateRefreshToken(user.id, null);
    await this.redisService.del(key);
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      const user = await this.userRepository.findById(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');
      if (!user.refreshToken)
        throw new UnauthorizedException('Invalid refresh token');
      const isTokenValid = await bcrypt.compare(
        refreshToken,
        user.refreshToken,
      );
      if (!isTokenValid)
        throw new UnauthorizedException('Invalid refresh token');
      const accessToken = await this.jwtService.signAsync(
        { sub: user.id, email: user.email },
        this.getAccessTokenSignOptions(),
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
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, this.getAccessTokenSignOptions()),
      this.jwtService.signAsync(payload, this.getRefreshTokenSignOptions()),
    ]);
    return { accessToken, refreshToken };
  }

  private getAccessTokenSignOptions(): jwt.SignOptions & { secret: string } {
    return {
      expiresIn: this.configService.getOrThrow(
        'JWT_EXPIRATION',
      ) as jwt.SignOptions['expiresIn'],
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
    };
  }

  private getRefreshTokenSignOptions(): jwt.SignOptions & { secret: string } {
    return {
      ...this.getAccessTokenSignOptions(),
      expiresIn: this.configService.getOrThrow(
        'JWT_REFRESH_EXPIRATION',
      ) as jwt.SignOptions['expiresIn'],
    };
  }

  private async ensureForgotPasswordRateLimit(email: string): Promise<void> {
    const limitKey = `limit:forgot:${email}`;
    const requestCount = await this.redisService.incr(limitKey);
    if (requestCount === 1) {
      await this.redisService.expire(
        limitKey,
        AUTH_CONSTANTS.FORGOT_PASSWORD_WINDOW_SECONDS,
      );
    }
    if (requestCount > AUTH_CONSTANTS.FORGOT_PASSWORD_REQUESTS_LIMIT) {
      throw new BadRequestException(
        'Too many requests. Please try again later.',
      );
    }
  }

  private getResetPasswordKey(email: string): string {
    return `reset_pass:${email}`;
  }

  private generateOtpCode(): string {
    const value = randomInt(AUTH_CONSTANTS.OTP_MIN, AUTH_CONSTANTS.OTP_MAX + 1);
    return value.toString();
  }

  private async updateRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    const hashedToken = await bcrypt.hash(
      refreshToken,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );
    await this.userRepository.updateRefreshToken(userId, hashedToken);
  }

  private async oauthLogin(data: UpsertOAuthUser): Promise<AuthResponse> {
    const normalizedData = {
      ...data,
      email: this.normalizeEmail(data.email),
    };
    const user = await this.userRepository.upsertOAuthUser(normalizedData);
    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toSafeUser(user),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
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
