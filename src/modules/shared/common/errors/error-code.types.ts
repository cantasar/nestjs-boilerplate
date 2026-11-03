import type { HttpStatus } from '@nestjs/common';

/** One error: a stable `code` clients branch on, its HTTP status and a default message. */
export interface ErrorCodeDefinition {
  readonly code: string;
  readonly httpStatus: HttpStatus;
  readonly message: string;
}

/** Values interpolated into a definition message via `{placeholder}` tokens. */
export type ErrorParams = Record<string, string | number>;
