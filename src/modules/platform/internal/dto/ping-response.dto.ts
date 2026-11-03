import { ApiProperty } from '@nestjs/swagger';

export class PingResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  timestamp: string;
}
