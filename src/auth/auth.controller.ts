import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
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

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Post('google')
  @ApiOperation({ summary: 'Sign in with Google ID token' })
  @ApiBody({ type: OAuthTokenDto })
  @ApiOkResponse({ description: 'Login successful', type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  async googleLogin(@Body() dto: OAuthTokenDto): Promise<AuthResponseDto> {
    return this.authService.googleLogin(dto.idToken);
  }

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
}
