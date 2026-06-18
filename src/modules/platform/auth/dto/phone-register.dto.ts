import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** E.164: optional `+`, leading non-zero digit, 8–15 digits total. */
const E164 = /^\+?[1-9]\d{7,14}$/;

/** Initiates phone signup: sends an SMS OTP. The user row is created on verify. */
export class PhoneRegisterDto {
  @ApiProperty({ example: '+15551234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(E164, { message: 'phone must be a valid E.164 number' })
  phone: string;

  @ApiProperty({ example: 'password123', minLength: 6, maxLength: 72 })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  password: string;
}
