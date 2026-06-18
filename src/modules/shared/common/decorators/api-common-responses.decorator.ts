import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ERROR_REGISTRY } from '../errors/error-registry';
import { ErrorResponseDto } from '../errors/dto/error-response.dto';
import { PaginationMetaDto } from '../dto/pagination-meta.dto';

const validationFailed = {
  description: 'Validation failed — request payload is invalid.',
  type: ErrorResponseDto,
};
const jwtFailed = {
  description: 'JWT is missing or invalid.',
  type: ErrorResponseDto,
};
const adminOnly = {
  description: 'Admin role is required.',
  type: ErrorResponseDto,
};
const notFound = { description: 'Resource not found.', type: ErrorResponseDto };

/** Public endpoint — only validation error. */
export function ApiPublicErrors() {
  return applyDecorators(ApiBadRequestResponse(validationFailed));
}

/** Authenticated endpoint — 400 + 401. */
export function ApiAuthErrors() {
  return applyDecorators(
    ApiBadRequestResponse(validationFailed),
    ApiUnauthorizedResponse(jwtFailed),
  );
}

/** Admin-only endpoint — 400 + 401 + 403. */
export function ApiAdminErrors() {
  return applyDecorators(
    ApiBadRequestResponse(validationFailed),
    ApiUnauthorizedResponse(jwtFailed),
    ApiForbiddenResponse(adminOnly),
  );
}

/** Admin + ID-based resource endpoint — 400 + 401 + 403 + 404. */
export function ApiResourceErrors() {
  return applyDecorators(
    ApiBadRequestResponse(validationFailed),
    ApiUnauthorizedResponse(jwtFailed),
    ApiForbiddenResponse(adminOnly),
    ApiNotFoundResponse(notFound),
  );
}

/**
 * Document a `2xx` that returns the success envelope wrapping a single DTO:
 * `{ success: true, data: <Dto> }`.
 */
export function ApiOkEnvelope<TModel extends Type<unknown>>(
  model: TModel,
  options?: { readonly status?: number; readonly description?: string },
) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: options?.status ?? 200,
      description: options?.description,
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
 * Document a `2xx` that returns the paginated envelope wrapping a DTO list:
 * `{ success: true, data: <Dto>[], meta: PaginationMetaDto }`.
 */
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

/**
 * Document the domain error `code`s an endpoint can return. Pass codes from the
 * per-domain enums. Codes are grouped by HTTP status (looked up in
 * `ERROR_REGISTRY`): one `@ApiResponse` per status, `$ref`-ing `ErrorResponseDto`,
 * with the eligible codes constrained as the `error.code` enum.
 */
export function ApiErrorCodes(...codes: string[]) {
  const byStatus = new Map<number, { code: string; message: string }[]>();
  for (const code of codes) {
    const def = ERROR_REGISTRY[code];
    if (!def) continue;
    const list = byStatus.get(def.httpStatus) ?? [];
    list.push({ code, message: def.message });
    byStatus.set(def.httpStatus, list);
  }

  const responses = [...byStatus.entries()].map(([status, entries]) =>
    ApiResponse({
      status,
      description: entries
        .map((entry) => `\`${entry.code}\` — ${entry.message}`)
        .join('\n\n'),
      schema: {
        allOf: [{ $ref: getSchemaPath(ErrorResponseDto) }],
        properties: {
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                enum: entries.map((entry) => entry.code),
              },
            },
          },
        },
      },
    }),
  );

  return applyDecorators(ApiExtraModels(ErrorResponseDto), ...responses);
}
