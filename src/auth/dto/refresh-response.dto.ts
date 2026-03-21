import { ApiProperty } from '@nestjs/swagger';

export class RefreshResponseDto {
  @ApiProperty()
  accessToken: string;
}
