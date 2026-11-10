import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class OAuthTokenDto {
  @ApiProperty({
    description: 'ID token from Google Sign-In on the device.',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
