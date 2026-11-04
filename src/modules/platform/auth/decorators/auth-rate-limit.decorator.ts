import { applyDecorators } from '@nestjs/common';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE } from '../auth.constants';

/** Strict rate limit for sensitive auth routes, shown in Swagger as a 429. */
export function AuthRateLimit(description = 'Too many tries, wait a minute.') {
  return applyDecorators(
    Throttle(AUTH_THROTTLE),
    ApiTooManyRequestsResponse({ description }),
  );
}
