import { ApiProperty } from '@nestjs/swagger';

export class RefreshResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({
    description: 'Rotated refresh token; replaces the prior one.',
  })
  refreshToken: string;
}
