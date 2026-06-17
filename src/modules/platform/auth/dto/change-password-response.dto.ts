import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}
