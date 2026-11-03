import { SetMetadata } from '@nestjs/common';

/** Metadata key the global JwtAuthGuard reads to skip authentication. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Lets a route or controller skip the global JWT check. Every other route
 * needs a valid JWT by default.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
