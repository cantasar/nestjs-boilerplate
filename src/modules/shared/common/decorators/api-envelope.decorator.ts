// NOTE: intentionally not yet wired to controllers — retrofit deferred (plan WS4f).
// Runtime already emits the envelope via ResponseTransformInterceptor; these
// helpers only make Swagger *document* it. Do NOT delete as "unused": apply
// ApiEnvelope / ApiPaginatedEnvelope per endpoint when retrofitting the docs.
import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMetaDto } from '../dto/pagination-meta.dto';

/**
 * Document a 200 wrapped in the success envelope: `{ success: true, data }`,
 * where `data` is a single `model` instance.
 */
export function ApiEnvelope<TModel extends Type<unknown>>(model: TModel) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: getSchemaPath(model) },
        },
      },
    }),
  );
}

/**
 * Document a 200 wrapped in the paginated success envelope:
 * `{ success: true, data: model[], meta: PaginationMetaDto }`.
 */
export function ApiPaginatedEnvelope<TModel extends Type<unknown>>(
  model: TModel,
) {
  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
  );
}
