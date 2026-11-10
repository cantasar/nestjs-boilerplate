import { type INestApplication, VersioningType } from '@nestjs/common';

/** Single source of truth for the API URL prefix and version. */
export const API_PREFIX = 'api';
export const API_VERSION = '1';
/** Where Swagger docs mount, e.g. `api/v1`. */
export const DOCS_PREFIX = `${API_PREFIX}/v${API_VERSION}`;

/**
 * Health and root routes skip the prefix and are `VERSION_NEUTRAL`, so they
 * stay at `/health` and `/`. Set the prefix before versioning; order matters.
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
