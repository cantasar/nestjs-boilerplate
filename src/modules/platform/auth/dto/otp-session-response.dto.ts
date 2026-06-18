import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Returned when an OTP session is created (email verification, email login,
 * phone register/login). The client submits `sessionToken` + the received code
 * to the matching verify endpoint. `otp` is only populated when the
 * `AUTH_DEBUG_RETURN_OTP` flag is enabled (local/dev convenience).
 */
export class OtpSessionResponseDto {
  @ApiProperty({ example: '8f2b1c3d-...', description: 'OTP session token' })
  sessionToken: string;

  @ApiProperty({
    example: 300,
    description: 'Seconds until the session expires',
  })
  expiresIn: number;

  @ApiPropertyOptional({
    example: '123456',
    description: 'Echoed OTP (debug mode only)',
  })
  otp?: string;
}
