import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiOkEnvelope } from '../../shared/common/decorators/api-common-responses.decorator';
import { AuthService } from './auth.service';
import { Public } from '../../shared/common/decorators/public.decorator';
import { GetUser } from '../../shared/common/decorators/get-user.decorator';
import { AuthRateLimit } from './decorators/auth-rate-limit.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import { ForgotPasswordResponseDto } from './dto/forgot-password-response.dto';
import { ResetPasswordResponseDto } from './dto/reset-password-response.dto';
import { OAuthTokenDto } from './dto/oauth-token.dto';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { ResendEmailVerificationDto } from './dto/resend-email-verification.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { OtpSessionResponseDto } from './dto/otp-session-response.dto';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';

const EMAIL_CODE_LIMIT =
  'Too many tries; an email with 10 wrong codes or 10 code mails today waits up to 24 hours.';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @AuthRateLimit()
  @Post('register')
  @ApiOperation({
    summary: 'Register with email and password',
    description:
      'Creates the account and logs in right away; get the email code with register/verify-email/resend.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiOkEnvelope(AuthResponseDto, {
    status: 201,
    description: 'Registration successful',
  })
  @ApiConflictResponse({ description: 'Email already in use' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @AuthRateLimit(EMAIL_CODE_LIMIT)
  @Post('register/verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the email with the 6-digit code' })
  @ApiBody({ type: OtpVerifyDto })
  @ApiOkEnvelope(AuthResponseDto, {
    description: 'Email verified, login successful',
  })
  @ApiBadRequestResponse({ description: 'Invalid or expired code/session' })
  verifyEmail(@Body() dto: OtpVerifyDto): Promise<AuthResponseDto> {
    return this.authService.verifyEmail(dto.sessionToken, dto.otp);
  }

  @Public()
  @AuthRateLimit(EMAIL_CODE_LIMIT)
  @Post('register/verify-email/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a new email verification code',
    description:
      'The answer looks the same for every email; a code is mailed only when the account needs one.',
  })
  @ApiBody({ type: ResendEmailVerificationDto })
  @ApiOkEnvelope(OtpSessionResponseDto, {
    description: 'Code sent if the account needs it',
  })
  resendEmailVerification(
    @Body() dto: ResendEmailVerificationDto,
  ): Promise<OtpSessionResponseDto> {
    return this.authService.resendEmailVerification(dto.email);
  }

  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiOkEnvelope(AuthResponseDto, { description: 'Login successful' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @AuthRateLimit()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with a Google ID token' })
  @ApiBody({ type: OAuthTokenDto })
  @ApiOkEnvelope(AuthResponseDto, { description: 'Login successful' })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  googleLogin(@Body() dto: OAuthTokenDto): Promise<AuthResponseDto> {
    return this.authService.googleLogin(dto.idToken);
  }

  @Public()
  @AuthRateLimit()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with an Apple ID token',
    description:
      'Apple sends the name only on the first sign-in, so pass it then.',
  })
  @ApiBody({ type: AppleAuthDto })
  @ApiOkEnvelope(AuthResponseDto, { description: 'Login successful' })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  appleLogin(@Body() dto: AppleAuthDto): Promise<AuthResponseDto> {
    return this.authService.appleLogin(
      dto.idToken,
      dto.firstName,
      dto.lastName,
    );
  }

  @Public()
  @AuthRateLimit(EMAIL_CODE_LIMIT)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a password reset code by email',
    description: 'Always returns the same message, even for unknown emails.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkEnvelope(ForgotPasswordResponseDto, {
    description: 'Code sent if the email exists',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponseDto> {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'If the email exists, a verification code has been sent.',
    };
  }

  @Public()
  @AuthRateLimit(EMAIL_CODE_LIMIT)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password with the reset code',
    description: 'All old refresh tokens stop working.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkEnvelope(ResetPasswordResponseDto, { description: 'Password updated' })
  @ApiBadRequestResponse({ description: 'Invalid or expired code' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<ResetPasswordResponseDto> {
    await this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
    return { success: true };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get new tokens with a refresh token',
    description: 'The old refresh token stops working after this call.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkEnvelope(RefreshResponseDto, { description: 'Token refreshed' })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  refresh(@Body() dto: RefreshTokenDto): Promise<RefreshResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @AuthRateLimit()
  @Patch('change-password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change the current user password',
    description:
      'Refresh tokens stop working now and access tokens when they expire, so log in again.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkEnvelope(ChangePasswordResponseDto, {
    description: 'Password changed',
  })
  @ApiBadRequestResponse({ description: 'Current password is incorrect' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async changePassword(
    @GetUser('id') userId: number,
    @Body() dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    await this.authService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return { success: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out and invalidate the refresh token',
    description:
      'The access token still works until it expires (JWT_EXPIRATION).',
  })
  @ApiNoContentResponse({ description: 'Logged out' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  logout(@GetUser('id') userId: number): Promise<void> {
    return this.authService.logout(userId);
  }
}
