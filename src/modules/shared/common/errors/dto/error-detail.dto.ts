import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The `error` member of the failure envelope. Carries the stable machine `code`,
 * a human-readable `message`, and optional `details` (e.g. per-field validation
 * issues). Modeled so Swagger can `$ref` it on documented error responses.
 */
export class ErrorDetailDto {
  @ApiProperty({
    example: 'AUTH_INVALID_CREDENTIALS',
    description:
      'Stable machine-readable error code. Branch on this, not the message.',
  })
  code: string;

  @ApiProperty({
    example: 'Invalid credentials',
    description: 'Human-readable message for logs / fallback display.',
  })
  message: string;

  @ApiPropertyOptional({
    description:
      'Optional structured details, e.g. per-field validation issues.',
    type: 'array',
    items: { type: 'string' },
  })
  details?: unknown[];
}
