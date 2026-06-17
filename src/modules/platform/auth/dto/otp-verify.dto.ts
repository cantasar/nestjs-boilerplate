import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/**
 * Shared request body for every session-based OTP verify endpoint
 * (email verification, passwordless email login, phone register, phone login).
 * The `sessionToken` was returned by the matching initiating endpoint.
 */
export class OtpVerifyDto {
  @ApiProperty({ example: '8f2b1c3d-...', description: 'OTP session token' })
  @IsString()
  sessionToken: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(6, 6)
  otp: string;
}
