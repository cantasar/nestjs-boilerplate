import { ApiProperty } from '@nestjs/swagger';

/** Response when refreshing access token. */
export class RefreshResponseDto {
  @ApiProperty()
  accessToken: string;
}
