import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type * as jwt from 'jsonwebtoken';
import type Redis from 'ioredis';
import { UserRepository } from '../users/user.repository';
import { MailService } from '../mail/mail.service';
import {
  FORGOT_PASSWORD_REQUESTS_LIMIT,
  FORGOT_PASSWORD_WINDOW_SECONDS,
  OTP_MIN,
  OTP_MAX,
} from './auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly mailService: MailService,
  ) {}

  async register(dto: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
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

  async login(dto: { email: string; password: string }) {
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

  async forgotPassword(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return;

    const limitKey = `limit:forgot:${email}`;
    const limit = await this.redis.incr(limitKey);
    if (limit === 1)
      await this.redis.expire(limitKey, FORGOT_PASSWORD_WINDOW_SECONDS);
    if (limit > FORGOT_PASSWORD_REQUESTS_LIMIT) {
      throw new BadRequestException(
        'Too many requests. Please try again later.',
      );
    }

    const code = Math.floor(
      OTP_MIN + Math.random() * (OTP_MAX - OTP_MIN + 1),
    ).toString();
    const key = `reset_pass:${email}`;
    const ttl = this.configService.getOrThrow<number>('REDIS_TTL');
    await this.redis.set(key, code, 'EX', ttl);

    try {
      await this.mailService.sendOtpEmail(email, code);
    } catch (error) {
      this.logger.error(
        'Mail sending failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const key = `reset_pass:${email}`;
    const storedCode = await this.redis.get(key);

    if (!storedCode || storedCode !== code) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.updatePassword(email, hashedPassword);
    await this.redis.del(key);
  }

  async refresh(refreshToken: string) {
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

  private async generateTokens(userId: number, email: string) {
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

  private async updateRefreshToken(userId: number, refreshToken: string) {
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
  }) {
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
