import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import type * as jwt from 'jsonwebtoken';
import { UserRepository } from '../../shared/database/repositories/user.repository';
import { MailQueueService } from '../mail/queue/mail-queue.service';
import { RedisService } from '../../shared/redis/redis.service';
import { generateOtpCode } from '../../shared/common/utils/otp.util';
import { DomainException } from '../../shared/common/errors/domain.exception';
import { AuthErrorCode } from '../../shared/common/errors/enums/auth-error-code.enum';
import { CommonErrorCode } from '../../shared/common/errors/enums/common-error-code.enum';
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
import { UserRole } from '../../shared/database/schema/enums/user-role.enum';
import appleSignin from 'apple-signin-auth';
import type { EmailVerifySession } from './interfaces/auth-session.types';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

interface SafeUser {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
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
  // Used for fake compares on unknown emails, so login timing does not reveal which accounts exist.
  private dummyPasswordHash: string | null = null;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly mailQueue: MailQueueService,
  ) {}

  async register(dto: RegisterInput): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser)
      throw new DomainException(AuthErrorCode.EMAIL_ALREADY_IN_USE);
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
    return this.issueAuthResponse(user);
  }

  async login(dto: LoginInput): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.userRepository.findByEmail(email);
    // Unknown and social-only accounts look like a wrong password: same code, same bcrypt time.
    if (!user?.password) {
      await this.dummyPasswordCompare(dto.password);
      throw new DomainException(AuthErrorCode.INVALID_CREDENTIALS);
    }
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid)
      throw new DomainException(AuthErrorCode.INVALID_CREDENTIALS);
    // The active check is in issueAuthResponse, after the password, so a wrong password never shows the status.
    return this.issueAuthResponse(user);
  }

  async googleLogin(idToken: string): Promise<AuthResponse> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new DomainException(AuthErrorCode.PROVIDER_DISABLED);
    if (!this.googleClient) this.googleClient = new OAuth2Client(clientId);
    // Checking `aud` rejects Google tokens made for another app.
    const ticket = await this.googleClient
      .verifyIdToken({ idToken, audience: clientId })
      .catch(() => {
        throw new UnauthorizedException('Invalid Token');
      });
    const payload = ticket.getPayload();
    // Accounts are linked by email, so only a verified email is trusted.
    if (!payload?.email || payload.email_verified !== true)
      throw new UnauthorizedException('Invalid Token');

    return this.oauthLogin({
      email: payload.email,
      firstName: payload.given_name,
      lastName: payload.family_name,
      picture: payload.picture,
      provider: AuthProvider.GOOGLE,
      providerId: payload.sub,
      emailVerified: true,
    });
  }

  async appleLogin(
    idToken: string,
    firstName?: string,
    lastName?: string,
  ): Promise<AuthResponse> {
    const bundleId = this.configService.get<string>('APPLE_BUNDLE_ID');
    if (!bundleId) throw new DomainException(AuthErrorCode.PROVIDER_DISABLED);
    const payload = await appleSignin
      .verifyIdToken(idToken, { audience: bundleId, ignoreExpiration: false })
      .catch(() => {
        throw new UnauthorizedException('Invalid Token');
      });
    // Apple sends `email_verified` as a string or a boolean.
    if (!payload?.email || String(payload.email_verified) !== 'true')
      throw new UnauthorizedException('Invalid Token');

    return this.oauthLogin({
      email: payload.email,
      firstName,
      lastName,
      picture: null,
      provider: AuthProvider.APPLE,
      providerId: payload.sub,
      emailVerified: true,
    });
  }

  async forgotPassword(rawEmail: string): Promise<void> {
    const email = this.normalizeEmail(rawEmail);
    // Limits run before the lookup, so unknown emails hit them too and nothing leaks.
    await this.ensureForgotPasswordRateLimit(email);
    await this.assertDailyMailLimit(email);
    await this.assertCodeTriesLeft(email);
    const user = await this.userRepository.findByEmail(email);
    if (!user) return;
    const code = generateOtpCode();
    const key = this.getResetPasswordKey(email);
    await this.redisService.setWithExpirySeconds(
      key,
      code,
      AUTH_CONSTANTS.PASSWORD_RESET_CODE_TTL_SECONDS,
    );
    // A new code gets its own tries.
    await this.redisService.del(AUTH_REDIS_KEYS.attempts(key));
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
    const email = this.normalizeEmail(rawEmail);
    const key = this.getResetPasswordKey(email);
    const storedCode = await this.redisService.get(key);
    const valid = await this.checkCode(
      email,
      key,
      storedCode,
      code,
      AUTH_CONSTANTS.PASSWORD_RESET_CODE_TTL_SECONDS,
    );
    // Deleting the code before the change makes it single-use, also for parallel requests.
    if (!valid || (await this.redisService.del(key)) === 0) {
      throw new DomainException(AuthErrorCode.INVALID_CODE);
    }
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new DomainException(AuthErrorCode.INVALID_CODE);
    }
    const hashedPassword = await bcrypt.hash(
      newPassword,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );
    await this.userRepository.updatePassword(email, hashedPassword);
    // The reset code came by email, so the email is proven now.
    if (!user.emailVerified)
      await this.userRepository.markEmailVerified(user.id);
    await this.userRepository.updateRefreshToken(user.id, null);
    await this.redisService.del(AUTH_REDIS_KEYS.attempts(key));
    await this.redisService.del(AUTH_REDIS_KEYS.codeFailures(email));
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    const invalid = new UnauthorizedException(
      'Invalid or expired refresh token',
    );
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, { secret });
    } catch {
      throw invalid;
    }
    // Only refresh tokens can be rotated, never access tokens. Database errors still become a 500.
    if (payload.tokenType !== 'refresh') throw invalid;
    const user = await this.userRepository.findById(payload.sub);
    if (!user?.isActive) throw invalid;
    // Rotation makes every refresh token single-use. The swap only works while the old hash is still stored.
    const tokens = await this.generateTokens(user.id, user.email);
    const rotated = await this.userRepository.rotateRefreshToken(
      user.id,
      this.hashToken(refreshToken),
      this.hashToken(tokens.refreshToken),
    );
    if (!rotated) throw invalid;
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // --- Email verification ------------------------------------------------

  /** Stores a verify session and mails its code. Mail errors are logged, so a mail outage does not lock the account. */
  private async issueEmailVerificationOtp(
    userId: number,
    email: string,
    sendMail: boolean,
  ): Promise<OtpSession> {
    const otp = generateOtpCode();
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
    if (!sendMail) return this.toOtpSession(sessionToken, ttl);
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
    if (!session) throw new DomainException(AuthErrorCode.INVALID_CODE);
    if (session.type !== 'email_verify')
      throw new DomainException(AuthErrorCode.INVALID_CODE);
    const valid = await this.checkCode(
      session.email,
      key,
      session.otp,
      otp,
      this.maxSessionTtlSeconds(),
    );
    if (!valid) throw new DomainException(AuthErrorCode.INVALID_CODE);
    if ((await this.redisService.del(key)) === 0)
      throw new DomainException(AuthErrorCode.INVALID_CODE);

    const user = await this.userRepository.findById(session.userId);
    if (!user) throw new DomainException(AuthErrorCode.INVALID_CODE);
    await this.userRepository.markEmailVerified(user.id);
    await this.redisService.del(AUTH_REDIS_KEYS.attempts(key));
    await this.redisService.del(AUTH_REDIS_KEYS.codeFailures(session.email));
    return this.issueAuthResponse(user);
  }

  async resendEmailVerification(rawEmail: string): Promise<OtpSession> {
    const email = this.normalizeEmail(rawEmail);
    await this.assertResendRateLimit(email);
    await this.assertDailyMailLimit(email);
    await this.assertCodeTriesLeft(email);
    const user = await this.userRepository.findByEmail(email);
    if (user && !user.emailVerified) {
      return this.issueEmailVerificationOtp(user.id, email, true);
    }
    // Unknown and verified emails get a stored session with no mail, so resend and verify act the same for every email.
    return this.issueEmailVerificationOtp(0, email, false);
  }

  // --- Authenticated actions ---------------------------------------------

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.password) throw new DomainException(AuthErrorCode.SOCIAL_ACCOUNT);
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid)
      throw new DomainException(AuthErrorCode.WRONG_PASSWORD);
    const hashedPassword = await bcrypt.hash(
      newPassword,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );
    await this.userRepository.updatePasswordById(userId, hashedPassword);
    // A new password ends every session, like a reset does.
    await this.userRepository.updateRefreshToken(userId, null);
  }

  async logout(userId: number): Promise<void> {
    await this.userRepository.updateRefreshToken(userId, null);
  }

  // --- Internal helpers --------------------------------------------------

  private async issueAuthResponse(user: User): Promise<AuthResponse> {
    if (!user.isActive) throw new UnauthorizedException('User is not active');
    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toSafeUser(user),
    };
  }

  /** Spends bcrypt time on a missing account to equalize login timing. */
  private async dummyPasswordCompare(password: string): Promise<void> {
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
   * Checks an email code with every counter raised first, so parallel guesses cannot pass a limit.
   * The last allowed wrong try burns the code; a correct code clears the counters in the caller.
   */
  private async checkCode(
    email: string,
    codeKey: string,
    expected: string | null,
    submitted: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const tries = await this.redisService.incrWithTtlSeconds(
      AUTH_REDIS_KEYS.codeFailures(email),
      AUTH_CONSTANTS.CODE_FAILURE_WINDOW_SECONDS,
    );
    if (tries > AUTH_CONSTANTS.CODE_FAILURE_LIMIT)
      throw new DomainException(CommonErrorCode.RATE_LIMITED);
    const attempts = await this.redisService.incrWithTtlSeconds(
      AUTH_REDIS_KEYS.attempts(codeKey),
      ttlSeconds,
    );
    const maxAttempts = this.getConfigNumber(
      AUTH_CONFIG_KEYS.OTP_MAX_ATTEMPTS,
      AUTH_OTP_DEFAULTS.OTP_MAX_ATTEMPTS,
    );
    if (
      expected &&
      attempts <= maxAttempts &&
      this.constantTimeEqual(submitted, expected)
    )
      return true;
    if (attempts >= maxAttempts) await this.redisService.del(codeKey);
    return false;
  }

  /** At most CODE_MAILS_PER_DAY code mails per email, so nobody can flood an inbox. */
  private async assertDailyMailLimit(email: string): Promise<void> {
    await this.assertRateLimit(
      AUTH_REDIS_KEYS.codeMailsPerDay(email),
      AUTH_CONSTANTS.CODE_MAILS_PER_DAY,
      AUTH_CONSTANTS.CODE_MAIL_WINDOW_SECONDS,
    );
  }

  /** Refuses new codes for an email with too many wrong codes. */
  private async assertCodeTriesLeft(email: string): Promise<void> {
    const failures = Number(
      await this.redisService.get(AUTH_REDIS_KEYS.codeFailures(email)),
    );
    if (failures >= AUTH_CONSTANTS.CODE_FAILURE_LIMIT)
      throw new DomainException(CommonErrorCode.RATE_LIMITED);
  }

  private async assertResendRateLimit(email: string): Promise<void> {
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

  private async assertRateLimit(
    key: string,
    max: number,
    windowSeconds: number,
  ): Promise<void> {
    const count = await this.redisService.incrWithTtlSeconds(
      key,
      windowSeconds,
    );
    if (count > max) throw new DomainException(CommonErrorCode.RATE_LIMITED);
  }

  private async generateTokens(
    userId: number,
    email: string | null,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Both tokens share a secret, so `tokenType` decides where each one is accepted.
    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      tokenType: 'access',
    };
    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      tokenType: 'refresh',
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        accessPayload,
        this.getAccessTokenSignOptions(),
      ),
      this.jwtService.signAsync(
        refreshPayload,
        this.getRefreshTokenSignOptions(),
      ),
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
      // A unique id, so two refresh tokens are never equal, even in the same second.
      jwtid: randomUUID(),
    };
  }

  private async ensureForgotPasswordRateLimit(email: string): Promise<void> {
    const requestCount = await this.redisService.incrWithTtlSeconds(
      AUTH_REDIS_KEYS.forgotPasswordLimit(email),
      AUTH_CONSTANTS.FORGOT_PASSWORD_WINDOW_SECONDS,
    );
    if (requestCount > AUTH_CONSTANTS.FORGOT_PASSWORD_REQUESTS_LIMIT) {
      throw new DomainException(CommonErrorCode.RATE_LIMITED);
    }
  }

  private getResetPasswordKey(email: string): string {
    return AUTH_REDIS_KEYS.resetPassword(email);
  }

  /** Attempt counters never outlive the longest session. */
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
    // Never echo OTPs in production, even if the debug flag is set by mistake.
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
    await this.userRepository.updateRefreshToken(
      userId,
      this.hashToken(refreshToken),
    );
  }

  /** SHA-256 of the whole token. bcrypt reads only 72 bytes, and refresh tokens of one user share those. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async oauthLogin(data: UpsertOAuthUser): Promise<AuthResponse> {
    const user = await this.userRepository.upsertOAuthUser({
      ...data,
      email: this.normalizeEmail(data.email),
    });
    return this.issueAuthResponse(user);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
