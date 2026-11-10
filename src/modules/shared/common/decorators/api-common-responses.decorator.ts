import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { PaginationMetaDto } from '../dto/pagination-meta.dto';

// String, Number and Boolean have no DTO schema, so getSchemaPath and
// ApiExtraModels can't be used for them.
const PRIMITIVE_SCHEMAS = new Map<unknown, { type: string }>([
  [String, { type: 'string' }],
  [Number, { type: 'number' }],
  [Boolean, { type: 'boolean' }],
]);

function dataSchema(model: Type<unknown>, isArray: boolean | undefined) {
  const primitive = PRIMITIVE_SCHEMAS.get(model);
  const item = primitive ?? { $ref: getSchemaPath(model) };
  return isArray ? { type: 'array', items: item } : item;
}

/**
 * Documents `{ success: true, data: <Dto> }`, or a plain `<Dto>[]` with
 * `isArray`. Use `ApiPaginatedEnvelope` for paginated lists.
 */
export function ApiOkEnvelope<TModel extends Type<unknown>>(
  model: TModel,
  options?: {
    readonly status?: number;
    readonly description?: string;
    readonly isArray?: boolean;
  },
) {
  const primitive = PRIMITIVE_SCHEMAS.has(model);
  return applyDecorators(
    ...(primitive ? [] : [ApiExtraModels(model)]),
    ApiResponse({
      status: options?.status ?? 200,
      description: options?.description,
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: dataSchema(model, options?.isArray),
        },
      },
    }),
  );
}

/** Documents the paginated envelope `{ success, data: <Dto>[], meta }`. */
export function ApiPaginatedEnvelope<TModel extends Type<unknown>>(
  model: TModel,
  options?: { readonly description?: string },
) {
  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiOkResponse({
      description: options?.description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
  );
}
