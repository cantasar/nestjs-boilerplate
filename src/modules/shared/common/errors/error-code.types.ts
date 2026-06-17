import type { HttpStatus } from '@nestjs/common';

/**
 * One entry in a domain error catalog. The `code` is the stable, machine-readable
 * contract surfaced to clients (frontend branches on it); `httpStatus` is the HTTP
 * status this scenario maps to; `message` is the default human-readable text.
 */
export interface ErrorCodeDefinition {
  readonly code: string;
  readonly httpStatus: HttpStatus;
  readonly message: string;
}

/** Values interpolated into a definition message via `{placeholder}` tokens. */
export type ErrorParams = Record<string, string | number>;
