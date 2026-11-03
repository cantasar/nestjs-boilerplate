import { ApiParam } from '@nestjs/swagger';

/** Swagger docs for a numeric `id` path param. */
export const ApiIntIdParam = (label: string, example = 1) =>
  ApiParam({
    name: 'id',
    type: 'integer',
    description: label,
    example,
  });
