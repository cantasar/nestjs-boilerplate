import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/** E.164: optional `+`, leading non-zero digit, 8–15 digits total. */
const E164 = /^\+?[1-9]\d{7,14}$/;

/** Initiates phone-OTP login: validates the password, then sends an SMS code. */
export class PhoneLoginDto {
  @ApiProperty({ example: '+15551234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(E164, { message: 'phone must be a valid E.164 number' })
  phone: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  password: string;
}
