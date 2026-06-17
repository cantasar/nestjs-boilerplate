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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../shared/common/decorators/public.decorator';
import { GetUser } from '../../shared/common/decorators/get-user.decorator';
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
import { EmailLoginDto } from './dto/email-login.dto';
import { PhoneRegisterDto } from './dto/phone-register.dto';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { OtpSessionResponseDto } from './dto/otp-session-response.dto';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: 'Registration successful',
    type: AuthResponseDto,
  })
  @ApiConflictResponse({ description: 'Email already in use' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('register/verify-email')
  @ApiOperation({
    summary: 'Verify email OTP after register and complete login',
  })
  @ApiBody({ type: OtpVerifyDto })
  @ApiOkResponse({
    description: 'Email verified, login successful',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid or expired OTP/session' })
  verifyEmail(@Body() dto: OtpVerifyDto): Promise<AuthResponseDto> {
    return this.authService.verifyEmail(dto.sessionToken, dto.otp);
  }

  @Public()
  @Post('register/verify-email/resend')
  @ApiOperation({ summary: 'Resend the email verification OTP' })
  @ApiBody({ type: ResendEmailVerificationDto })
  @ApiOkResponse({
    description: 'Verification code resent if the account needs it',
    type: OtpSessionResponseDto,
  })
  async resendEmailVerification(
    @Body() dto: ResendEmailVerificationDto,
  ): Promise<OtpSessionResponseDto> {
    const session = await this.authService.resendEmailVerification(dto.email);
    // Enumeration-safe: return an empty envelope when no code was sent.
    return session ?? { sessionToken: '', expiresIn: 0 };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('login/email')
  @ApiOperation({ summary: 'Send a login OTP to the account email' })
  @ApiBody({ type: EmailLoginDto })
  @ApiOkResponse({
    description: 'Login OTP session created',
    type: OtpSessionResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  loginEmail(@Body() dto: EmailLoginDto): Promise<OtpSessionResponseDto> {
    return this.authService.loginEmail(dto.email, dto.password);
  }

  @Public()
  @Post('login/email/verify')
  @ApiOperation({ summary: 'Verify email OTP and complete login' })
  @ApiBody({ type: OtpVerifyDto })
  @ApiOkResponse({ description: 'Login successful', type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or expired OTP/session' })
  verifyEmailLogin(@Body() dto: OtpVerifyDto): Promise<AuthResponseDto> {
    return this.authService.verifyEmailLogin(dto.sessionToken, dto.otp);
  }

  @Public()
  @Post('register/phone')
  @ApiOperation({ summary: 'Send an OTP for phone registration' })
  @ApiBody({ type: PhoneRegisterDto })
  @ApiCreatedResponse({
    description: 'Phone OTP session created',
    type: OtpSessionResponseDto,
  })
  @ApiConflictResponse({ description: 'Phone already in use' })
  registerPhone(@Body() dto: PhoneRegisterDto): Promise<OtpSessionResponseDto> {
    return this.authService.registerPhone(dto.phone, dto.password);
  }

  @Public()
  @Post('register/phone/verify')
  @ApiOperation({ summary: 'Verify phone OTP and complete registration' })
  @ApiBody({ type: OtpVerifyDto })
  @ApiOkResponse({
    description: 'Registration successful',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid or expired OTP/session' })
  verifyPhoneRegister(@Body() dto: OtpVerifyDto): Promise<AuthResponseDto> {
    return this.authService.verifyPhoneRegister(dto.sessionToken, dto.otp);
  }

  @Public()
  @Post('login/phone')
  @ApiOperation({ summary: 'Send a login OTP to the account phone' })
  @ApiBody({ type: PhoneLoginDto })
  @ApiOkResponse({
    description: 'Login OTP session created',
    type: OtpSessionResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  loginPhone(@Body() dto: PhoneLoginDto): Promise<OtpSessionResponseDto> {
    return this.authService.loginPhone(dto.phone, dto.password);
  }

  @Public()
  @Post('login/phone/verify')
  @ApiOperation({ summary: 'Verify phone OTP and complete login' })
  @ApiBody({ type: OtpVerifyDto })
  @ApiOkResponse({ description: 'Login successful', type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or expired OTP/session' })
  verifyPhoneLogin(@Body() dto: OtpVerifyDto): Promise<AuthResponseDto> {
    return this.authService.verifyPhoneLogin(dto.sessionToken, dto.otp);
  }

  @Public()
  @Post('google')
  @ApiOperation({ summary: 'Sign in with Google ID token' })
  @ApiBody({ type: OAuthTokenDto })
  @ApiOkResponse({ description: 'Login successful', type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  async googleLogin(@Body() dto: OAuthTokenDto): Promise<AuthResponseDto> {
    return this.authService.googleLogin(dto.idToken);
  }

  @Public()
  @Post('apple')
  @ApiOperation({ summary: 'Sign in with Apple ID token' })
  @ApiBody({ type: AppleAuthDto })
  @ApiOkResponse({ description: 'Login successful', type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  async appleLogin(@Body() dto: AppleAuthDto): Promise<AuthResponseDto> {
    return this.authService.appleLogin(
      dto.idToken,
      dto.firstName,
      dto.lastName,
    );
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Send reset code to email if account exists' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({
    description: 'Code sent if email exists',
    type: ForgotPasswordResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Too many requests' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponseDto> {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'If the email exists, a verification code has been sent.',
    };
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with verification code' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({
    description: 'Password updated',
    type: ResetPasswordResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid or expired code' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<ResetPasswordResponseDto> {
    await this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
    return { success: true };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({
    description: 'Token refreshed',
    type: RefreshResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  refresh(@Body() dto: RefreshTokenDto): Promise<RefreshResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Patch('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the current user password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({
    description: 'Password changed',
    type: ChangePasswordResponseDto,
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
  @ApiOperation({ summary: 'Log out and invalidate the refresh token' })
  @ApiNoContentResponse({ description: 'Logged out' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  logout(@GetUser('id') userId: number): Promise<void> {
    // void-ok
    return this.authService.logout(userId);
  }
}
