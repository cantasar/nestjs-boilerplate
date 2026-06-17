import { SetMetadata } from '@nestjs/common';

/** Metadata key the global JwtAuthGuard reads to skip authentication. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or whole controller) as public so the global JwtAuthGuard lets
 * the request through without a valid JWT. Auth is fail-closed by default — every
 * route requires a token unless explicitly opted out with `@Public()`.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
