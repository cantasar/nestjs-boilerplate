import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { Public } from './public.decorator';

/** Swagger security scheme name registered in `setupSwagger` (`addApiKey`). */
export const API_KEY_SECURITY_SCHEME = 'api-key';

/**
 * Mark a route as authenticated by the [ApiKeyGuard] (server-to-server).
 *
 * Bundles everything a key-protected route needs:
 * - `@Public()` — bypass the global fail-closed JWT guard (JWT is not used here);
 * - `@UseGuards(ApiKeyGuard)` — enforce the `X-API-Key` header;
 * - `@ApiSecurity('api-key')` — render the Swagger lock + `X-API-Key` input so
 *   the declared scheme is actually consumed (mirrors `@ApiBearerAuth` for JWT).
 */
export function ApiKeyAuth() {
  return applyDecorators(
    Public(),
    UseGuards(ApiKeyGuard),
    ApiSecurity(API_KEY_SECURITY_SCHEME),
    ApiUnauthorizedResponse({ description: 'API key is missing or invalid.' }),
  );
}
