import { ApiParam } from '@nestjs/swagger';

/** UUID path param composer. */
export const ApiUuidParam = (name: string, label: string) =>
  ApiParam({
    name,
    type: 'string',
    format: 'uuid',
    description: label,
    example: '550e8400-e29b-41d4-a716-446655440000',
  });

/** Generic numeric resource ID path param. */
export const ApiIntIdParam = (label: string, example = 1) =>
  ApiParam({
    name: 'id',
    type: 'integer',
    description: label,
    example,
  });
