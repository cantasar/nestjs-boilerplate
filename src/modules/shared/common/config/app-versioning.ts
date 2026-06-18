import { type INestApplication, VersioningType } from '@nestjs/common';

/**
 * Single source of truth for the API URL shape. Used by both `main.ts` and the
 * e2e bootstrap so prod and tests can never drift on prefix/versioning/exclude.
 */
export const API_PREFIX = 'api';
export const API_VERSION = '1';
/** Where Swagger docs mount, e.g. `api/v1`. Derived — keep in lockstep with the prefix. */
export const DOCS_PREFIX = `${API_PREFIX}/v${API_VERSION}`;

/**
 * Global prefix + native URI versioning. `health`/`root` are excluded from the
 * prefix AND declared `VERSION_NEUTRAL`, so they resolve at `/health` and `/`.
 * Order matters: prefix first, then versioning.
 */
export function configureVersioning(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: ['/', 'health', 'health/live', 'health/ready'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });
}
