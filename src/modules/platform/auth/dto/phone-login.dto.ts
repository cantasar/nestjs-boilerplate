import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Initiates phone-OTP login: validates the password, then sends an SMS code. */
export class PhoneLoginDto {
  @ApiProperty({ example: '+15551234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  phone: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  password: string;
}
