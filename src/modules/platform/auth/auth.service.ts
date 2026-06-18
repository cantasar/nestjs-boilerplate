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
import { randomInt, randomUUID, timingSafeEqual } from 'crypto';
import type * as jwt from 'jsonwebtoken';
import { UserRepository } from '../../shared/database/repositories/user.repository';
import { MailQueueService } from '../mail/queue/mail-queue.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  AUTH_CONSTANTS,
  AUTH_CONFIG_KEYS,
  AUTH_OTP_DEFAULTS,
  AUTH_REDIS_KEYS,
} from './auth.constants';
import { UpsertOAuthUser } from '../../shared/database/types';
import type { User } from '../../shared/database/types/user-select.type';
import { OAuth2Client } from 'google-auth-library';
import { AuthProvider } from '../../shared/database/schema/enums/auth-provider.enum';
import appleSignin from 'apple-signin-auth';
import { SMS_SENDER } from '../sms/interfaces/sms-sender.interface';
import type { SmsSender } from '../sms/interfaces/sms-sender.interface';
import type {
  EmailVerifySession,
  EmailLoginSession,
  PhoneSession,
} from './interfaces/auth-session.types';

interface SafeUser {
  id: number;
  email: string | null;
  phone: string | null;
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
  refreshToken: string;
}

interface OtpSession {
  sessionToken: string;
  expiresIn: number;
  otp?: string;
}

interface JwtPayload {
  sub: number;
  email: string | null;
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
  // Lazily computed once, then reused, so a "user not found" login path still
  // spends bcrypt time — denying a timing oracle that distinguishes unknown
  // accounts. Lazy (not a field initializer) so construction stays cheap.
  private dummyPasswordHash: string | null = null;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly mailQueue: MailQueueService,
    @Inject(SMS_SENDER) private readonly smsSender: SmsSender,
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
    if (!user) {
      await this.dummyPasswordCompare(dto.password);
      throw new UnauthorizedException('Invalid credentials');
    }
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
    // Assert the token's `aud` matches our client id — without it, a valid
    // Google token minted for a different OAuth client would be accepted.
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: clientId,
    });
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
    // void-ok
    const email = this.normalizeEmail(rawEmail);
    // Rate-limit before the user lookup so the limiter engages for unknown
    // emails too — otherwise only existing accounts can hit the limit, leaking
    // existence.
    await this.ensureForgotPasswordRateLimit(email);
    const user = await this.userRepository.findByEmail(email);
    if (!user) return;
    const code = this.generateOtpCode();
    const key = this.getResetPasswordKey(email);
    const ttl = this.configService.getOrThrow<number>('REDIS_TTL');
    await this.redisService.setWithExpirySeconds(key, code, ttl);
    try {
      await this.mailQueue.enqueue({
        template: 'password-reset',
        to: email,
        code,
      });
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
    // void-ok
    const email = this.normalizeEmail(rawEmail);
    const key = this.getResetPasswordKey(email);
    const storedCode = await this.redisService.get(key);
    if (!storedCode || !this.constantTimeEqual(storedCode, code)) {
      // Count failures and burn the code after too many, so a 6-digit code
      // can't be brute-forced within the TTL window.
      await this.registerResetFailure(key);
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
    await this.redisService.del(AUTH_REDIS_KEYS.attempts(key));
  }

  /**
   * Increments the reset-code failure counter; once the attempt limit is hit the
   * code + counter are deleted so further guesses fail closed.
   */
  private async registerResetFailure(key: string): Promise<void> {
    // void-ok
    const attemptsKey = AUTH_REDIS_KEYS.attempts(key);
    const attempts = await this.redisService.incr(attemptsKey);
    if (attempts === 1) {
      await this.redisService.expire(
        attemptsKey,
        this.configService.getOrThrow<number>('REDIS_TTL'),
      );
    }
    const maxAttempts = this.getConfigNumber(
      AUTH_CONFIG_KEYS.OTP_MAX_ATTEMPTS,
      AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS,
    );
    if (attempts >= maxAttempts) {
      await this.redisService.del(key);
      await this.redisService.del(attemptsKey);
    }
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
      // Rotate: issue a new refresh token and overwrite the stored hash, so the
      // presented token is single-use — a leaked/replayed old token no longer
      // matches and is rejected.
      const tokens = await this.generateTokens(user.id, user.email);
      await this.updateRefreshToken(user.id, tokens.refreshToken);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // --- Email verification (after register) -------------------------------

  /**
   * Issues an email-verification OTP for a freshly created account and returns
   * the session token. Mail delivery is best-effort so a transient SMTP error
   * does not lock the new account out — the session stays valid until TTL.
   */
  async issueEmailVerificationOtp(
    userId: number,
    email: string,
  ): Promise<OtpSession> {
    const otp = this.generateOtpCode();
    const sessionToken = randomUUID();
    const ttl = this.getConfigNumber(
      AUTH_CONFIG_KEYS.EMAIL_VERIFY_SESSION_TTL_SECONDS,
      AUTH_OTP_DEFAULTS.EMAIL_VERIFY_SESSION_TTL_SECONDS,
    );
    const session: EmailVerifySession = {
      type: 'email_verify',
      email,
      userId,
      otp,
    };
    await this.redisService.setWithExpirySeconds(
      AUTH_REDIS_KEYS.emailVerifySession(sessionToken),
      JSON.stringify(session),
      ttl,
    );
    try {
      await this.mailQueue.enqueue({
        template: 'verify-email',
        to: email,
        code: otp,
      });
    } catch (error) {
      this.logger.error(
        'Verification mail failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
    return this.toOtpSession(sessionToken, ttl, otp);
  }

  async verifyEmail(sessionToken: string, otp: string): Promise<AuthResponse> {
    const key = AUTH_REDIS_KEYS.emailVerifySession(sessionToken);
    const session = await this.readSession<EmailVerifySession>(key);
    if (!session) throw new BadRequestException('Invalid or expired session');
    if (session.type !== 'email_verify')
      throw new BadRequestException('Invalid session type');
    await this.assertOtpMatch(key, otp, session.otp);
    if ((await this.redisService.del(key)) === 0)
      throw new BadRequestException('Session already used');

    const user = await this.userRepository.findById(session.userId);
    if (!user) throw new BadRequestException('User not found');
    await this.userRepository.markEmailVerified(user.id);
    return this.issueAuthResponse(user);
  }

  async resendEmailVerification(rawEmail: string): Promise<OtpSession | null> {
    const email = this.normalizeEmail(rawEmail);
    await this.assertResendRateLimit(email);
    const user = await this.userRepository.findByEmail(email);
    // Enumeration-safe: no hint when the account is missing or already verified.
    if (!user || user.emailVerified) return null;
    return this.issueEmailVerificationOtp(user.id, email);
  }

  // --- Passwordless email login ------------------------------------------

  async loginEmail(rawEmail: string, password: string): Promise<OtpSession> {
    const email = this.normalizeEmail(rawEmail);
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      await this.dummyPasswordCompare(password);
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) throw new UnauthorizedException('User is not active');
    if (!user.password)
      throw new UnauthorizedException('This account uses social login');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid credentials');

    await this.assertEmailLoginRateLimit(email);
    const otp = this.generateOtpCode();
    const sessionToken = randomUUID();
    const ttl = this.getConfigNumber(
      AUTH_CONFIG_KEYS.EMAIL_LOGIN_SESSION_TTL_SECONDS,
      AUTH_OTP_DEFAULTS.EMAIL_LOGIN_SESSION_TTL_SECONDS,
    );
    const session: EmailLoginSession = {
      type: 'email_login',
      email,
      userId: user.id,
      otp,
    };
    const key = AUTH_REDIS_KEYS.emailLoginSession(sessionToken);
    await this.redisService.setWithExpirySeconds(
      key,
      JSON.stringify(session),
      ttl,
    );
    try {
      await this.mailQueue.enqueue({ template: 'otp', to: email, code: otp });
    } catch (error) {
      await this.redisService.del(key);
      this.logger.error(
        'Login mail failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Could not deliver verification code',
      );
    }
    return this.toOtpSession(sessionToken, ttl, otp);
  }

  async verifyEmailLogin(
    sessionToken: string,
    otp: string,
  ): Promise<AuthResponse> {
    const key = AUTH_REDIS_KEYS.emailLoginSession(sessionToken);
    const session = await this.readSession<EmailLoginSession>(key);
    if (!session) throw new BadRequestException('Invalid or expired session');
    if (session.type !== 'email_login')
      throw new BadRequestException('Invalid session type');
    await this.assertOtpMatch(key, otp, session.otp);
    if ((await this.redisService.del(key)) === 0)
      throw new BadRequestException('Session already used');

    const user = await this.userRepository.findById(session.userId);
    if (!user) throw new BadRequestException('User not found');
    return this.issueAuthResponse(user);
  }

  // --- Phone register ----------------------------------------------------

  async registerPhone(rawPhone: string, password: string): Promise<OtpSession> {
    const phone = this.normalizePhone(rawPhone);
    const existing = await this.userRepository.findByPhone(phone);
    if (existing) throw new ConflictException('Phone already in use');
    const hashedPassword = await bcrypt.hash(
      password,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );
    const otp = await this.sendPhoneOtp(phone);
    const sessionToken = randomUUID();
    const ttl = this.getConfigNumber(
      AUTH_CONFIG_KEYS.PHONE_SESSION_TTL_SECONDS,
      AUTH_OTP_DEFAULTS.PHONE_SESSION_TTL_SECONDS,
    );
    const session: PhoneSession = {
      type: 'phone_register',
      phone,
      hashedPassword,
      otp,
    };
    await this.redisService.setWithExpirySeconds(
      AUTH_REDIS_KEYS.phoneSession(sessionToken),
      JSON.stringify(session),
      ttl,
    );
    return this.toOtpSession(sessionToken, ttl);
  }

  async verifyPhoneRegister(
    sessionToken: string,
    otp: string,
  ): Promise<AuthResponse> {
    const key = AUTH_REDIS_KEYS.phoneSession(sessionToken);
    const session = await this.readSession<PhoneSession>(key);
    if (!session) throw new BadRequestException('Invalid or expired session');
    if (session.type !== 'phone_register')
      throw new BadRequestException('Invalid session type');
    await this.assertOtpMatch(key, otp, session.otp);
    if ((await this.redisService.del(key)) === 0)
      throw new BadRequestException('Session already used');

    const user = await this.userRepository.create({
      phone: session.phone,
      password: session.hashedPassword,
      phoneVerified: true,
      isActive: true,
    });
    if (!user) throw new InternalServerErrorException('Failed to create user');
    return this.issueAuthResponse(user);
  }

  // --- Phone login -------------------------------------------------------

  async loginPhone(rawPhone: string, password: string): Promise<OtpSession> {
    const phone = this.normalizePhone(rawPhone);
    const user = await this.userRepository.findByPhone(phone);
    if (!user) {
      await this.dummyPasswordCompare(password);
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) throw new UnauthorizedException('User is not active');
    if (!user.password)
      throw new UnauthorizedException('This account uses social login');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid credentials');

    const otp = await this.sendPhoneOtp(phone);
    const sessionToken = randomUUID();
    const ttl = this.getConfigNumber(
      AUTH_CONFIG_KEYS.PHONE_SESSION_TTL_SECONDS,
      AUTH_OTP_DEFAULTS.PHONE_SESSION_TTL_SECONDS,
    );
    const session: PhoneSession = {
      type: 'phone_login',
      phone,
      userId: user.id,
      otp,
    };
    await this.redisService.setWithExpirySeconds(
      AUTH_REDIS_KEYS.phoneSession(sessionToken),
      JSON.stringify(session),
      ttl,
    );
    // Login OTP is never echoed, even in debug mode.
    return this.toOtpSession(sessionToken, ttl);
  }

  async verifyPhoneLogin(
    sessionToken: string,
    otp: string,
  ): Promise<AuthResponse> {
    const key = AUTH_REDIS_KEYS.phoneSession(sessionToken);
    const session = await this.readSession<PhoneSession>(key);
    if (!session) throw new BadRequestException('Invalid or expired session');
    if (session.type !== 'phone_login')
      throw new BadRequestException('Invalid session type');
    await this.assertOtpMatch(key, otp, session.otp);
    if ((await this.redisService.del(key)) === 0)
      throw new BadRequestException('Session already used');

    const user = await this.userRepository.findById(session.userId);
    if (!user) throw new BadRequestException('User not found');
    return this.issueAuthResponse(user);
  }

  // --- Authenticated actions --------------------------------------------

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // void-ok
    const user = await this.userRepository.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.password)
      throw new BadRequestException('This account uses social login');
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid)
      throw new BadRequestException('Current password is incorrect');
    const hashedPassword = await bcrypt.hash(
      newPassword,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );
    await this.userRepository.updatePasswordById(userId, hashedPassword);
  }

  async logout(userId: number): Promise<void> {
    // void-ok: clears the stored refresh token so it can no longer be rotated.
    await this.userRepository.updateRefreshToken(userId, null);
  }

  // --- Internal helpers --------------------------------------------------

  private async issueAuthResponse(user: User): Promise<AuthResponse> {
    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toSafeUser(user),
    };
  }

  /** Sends an OTP over SMS and returns it (for storage in the session). */
  private async sendPhoneOtp(phone: string): Promise<string> {
    await this.assertPhoneOtpRateLimit(phone);
    const otp = this.generateOtpCode();
    try {
      await this.smsSender.send(phone, `Your verification code is ${otp}`);
    } catch (error) {
      this.logger.error(
        'SMS sending failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Could not deliver verification code',
      );
    }
    return otp;
  }

  /** Spends bcrypt time on a missing account to equalize login timing. */
  private async dummyPasswordCompare(password: string): Promise<void> {
    // void-ok
    if (!this.dummyPasswordHash) {
      this.dummyPasswordHash = await bcrypt.hash(
        randomUUID(),
        AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
      );
    }
    await bcrypt.compare(password, this.dummyPasswordHash);
  }

  /** Constant-time equality for fixed-length secrets (OTPs, reset codes). */
  private constantTimeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }

  private async readSession<T>(key: string): Promise<T | null> {
    const raw = await this.redisService.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Compares a submitted OTP against the stored one. On mismatch it increments a
   * per-session attempt counter; once the limit is hit the session and its
   * counter are burned. Throws on every failure path.
   */
  private async assertOtpMatch(
    sessionKey: string,
    submittedOtp: string,
    expectedOtp: string,
  ): Promise<void> {
    // void-ok
    if (this.constantTimeEqual(submittedOtp, expectedOtp)) return;
    const attemptsKey = AUTH_REDIS_KEYS.attempts(sessionKey);
    const attempts = await this.redisService.incr(attemptsKey);
    if (attempts === 1) {
      // Bound the counter so it can never outlive the session it guards.
      await this.redisService.expire(attemptsKey, this.maxSessionTtlSeconds());
    }
    const maxAttempts = this.getConfigNumber(
      AUTH_CONFIG_KEYS.OTP_MAX_ATTEMPTS,
      AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS,
    );
    if (attempts >= maxAttempts) {
      await this.redisService.del(sessionKey);
      await this.redisService.del(attemptsKey);
      throw new BadRequestException('Too many failed attempts');
    }
    throw new BadRequestException('Invalid verification code');
  }

  private async assertResendRateLimit(email: string): Promise<void> {
    // void-ok
    await this.assertRateLimit(
      AUTH_REDIS_KEYS.emailVerifyResendLimit(email),
      this.getConfigNumber(
        AUTH_CONFIG_KEYS.RESEND_RATE_LIMIT_MAX,
        AUTH_OTP_DEFAULTS.RESEND_RATE_LIMIT_MAX,
      ),
      this.getConfigNumber(
        AUTH_CONFIG_KEYS.RESEND_RATE_LIMIT_WINDOW_SECONDS,
        AUTH_OTP_DEFAULTS.RESEND_RATE_LIMIT_WINDOW_SECONDS,
      ),
    );
  }

  private async assertEmailLoginRateLimit(email: string): Promise<void> {
    // void-ok
    await this.assertRateLimit(
      AUTH_REDIS_KEYS.emailLoginLimit(email),
      this.getConfigNumber(
        AUTH_CONFIG_KEYS.RESEND_RATE_LIMIT_MAX,
        AUTH_OTP_DEFAULTS.RESEND_RATE_LIMIT_MAX,
      ),
      this.getConfigNumber(
        AUTH_CONFIG_KEYS.RESEND_RATE_LIMIT_WINDOW_SECONDS,
        AUTH_OTP_DEFAULTS.RESEND_RATE_LIMIT_WINDOW_SECONDS,
      ),
    );
  }

  private async assertPhoneOtpRateLimit(phone: string): Promise<void> {
    // void-ok
    await this.assertRateLimit(
      AUTH_REDIS_KEYS.phoneOtpLimit(phone),
      this.getConfigNumber(
        AUTH_CONFIG_KEYS.PHONE_RATE_LIMIT_MAX,
        AUTH_OTP_DEFAULTS.PHONE_RATE_LIMIT_MAX,
      ),
      this.getConfigNumber(
        AUTH_CONFIG_KEYS.PHONE_RATE_LIMIT_WINDOW_SECONDS,
        AUTH_OTP_DEFAULTS.PHONE_RATE_LIMIT_WINDOW_SECONDS,
      ),
    );
  }

  private async assertRateLimit(
    key: string,
    max: number,
    windowSeconds: number,
  ): Promise<void> {
    // void-ok
    const count = await this.redisService.incr(key);
    if (count === 1) await this.redisService.expire(key, windowSeconds);
    if (count > max)
      throw new BadRequestException(
        'Too many requests. Please try again later.',
      );
  }

  private async generateTokens(
    userId: number,
    email: string | null,
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
    // void-ok
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

  /** Upper bound for the attempt-counter TTL (longest session kind). */
  private maxSessionTtlSeconds(): number {
    return this.getConfigNumber(
      AUTH_CONFIG_KEYS.EMAIL_VERIFY_SESSION_TTL_SECONDS,
      AUTH_OTP_DEFAULTS.EMAIL_VERIFY_SESSION_TTL_SECONDS,
    );
  }

  private getConfigNumber(key: string, fallback: number): number {
    const value = this.configService.get<number>(key);
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  private shouldEchoOtp(): boolean {
    // Never echo OTPs in production, even if the debug flag is mistakenly set.
    return (
      this.configService.get<string>('NODE_ENV') !== 'production' &&
      this.configService.get<string>(AUTH_CONFIG_KEYS.DEBUG_RETURN_OTP) ===
        'true'
    );
  }

  private toOtpSession(
    sessionToken: string,
    expiresIn: number,
    otp?: string,
  ): OtpSession {
    return {
      sessionToken,
      expiresIn,
      ...(otp && this.shouldEchoOtp() ? { otp } : {}),
    };
  }

  private async updateRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    // void-ok
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

  /**
   * Provider-agnostic phone normalization: strips everything except a leading
   * `+` and digits, then requires at least 8 digits. No country assumptions —
   * clients should submit E.164 (e.g. `+15551234567`).
   */
  private normalizePhone(phone: string): string {
    const cleaned = phone.trim().replace(/(?!^\+)\D/g, '');
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15)
      throw new BadRequestException('Invalid phone number');
    return cleaned;
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
