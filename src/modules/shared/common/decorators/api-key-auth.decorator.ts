import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { Public } from './public.decorator';

/** Swagger security scheme name registered in `setupSwagger` (`addApiKey`). */
export const API_KEY_SECURITY_SCHEME = 'api-key';

/**
 * Protects a server-to-server route with the `X-API-Key` header instead of a
 * JWT. `@Public()` is only there so the global JWT guard skips the route.
 */
export function ApiKeyAuth() {
  return applyDecorators(
    Public(),
    UseGuards(ApiKeyGuard),
    ApiSecurity(API_KEY_SECURITY_SCHEME),
    ApiUnauthorizedResponse({ description: 'API key is missing or invalid.' }),
  );
}
