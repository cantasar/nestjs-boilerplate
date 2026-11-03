import { ApiProperty } from '@nestjs/swagger';
import { ErrorDetailDto } from './error-detail.dto';

/** Failure envelope for every 4xx/5xx: `{ success: false, error: { code, message, details? } }`. */
export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ type: ErrorDetailDto })
  error: ErrorDetailDto;
}
