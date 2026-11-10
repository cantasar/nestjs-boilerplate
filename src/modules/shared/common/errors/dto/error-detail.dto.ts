import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The `error` part of the failure envelope, used by Swagger on error responses. */
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
    example: ['email must be an email'],
  })
  details?: unknown[];
}
