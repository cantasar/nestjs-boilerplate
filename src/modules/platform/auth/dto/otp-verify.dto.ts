import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

/** Body for the verify endpoint. `sessionToken` comes from the call that sent the code. */
export class OtpVerifyDto {
  @ApiProperty({
    example: '3f6c1e2a-9b7d-4c1e-8a2f-5d6b7c8e9f01',
    description: 'OTP session token',
  })
  @IsUUID('4')
  sessionToken: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(6, 6)
  otp: string;
}
