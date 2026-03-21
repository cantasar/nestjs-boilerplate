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

/** Auth endpoints: register, login, password reset, token refresh. */
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

  @Post('forgot-password')
  @ApiOperation({ summary: 'Send reset code to email if account exists' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ description: 'Code sent if email exists' })
  @ApiBadRequestResponse({ description: 'Too many requests' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{
    message: string;
  }> {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'If the email exists, a verification code has been sent.',
    };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with verification code' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: 'Password updated' })
  @ApiBadRequestResponse({ description: 'Invalid or expired code' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{
    success: boolean;
  }> {
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
