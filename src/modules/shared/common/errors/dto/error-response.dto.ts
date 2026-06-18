import { ApiProperty } from '@nestjs/swagger';
import { ErrorDetailDto } from './error-detail.dto';

/**
 * The failure envelope produced by `HttpExceptionFilter` for every 4xx/5xx on a
 * versioned route: `{ success: false, error: { code, message, details? } }`.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ type: ErrorDetailDto })
  error: ErrorDetailDto;
}
