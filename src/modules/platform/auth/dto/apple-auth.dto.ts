import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AppleAuthDto {
  @ApiProperty({
    description: 'Identity token from Sign in with Apple on the device.',
    example: 'eyJraWQiOiJXNldjT0tCIiwiYWxnIjoiUlMyNTYifQ...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({
    description: 'Apple sends the name only on the first sign-in.',
    example: 'Jane',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Apple sends the name only on the first sign-in.',
    example: 'Doe',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  lastName?: string;
}
