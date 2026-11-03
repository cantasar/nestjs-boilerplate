import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Send `sessionToken` and the emailed code to the verify endpoint. `otp` is filled only in local debug mode. */
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
