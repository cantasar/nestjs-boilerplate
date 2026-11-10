import { HttpException } from '@nestjs/common';
import type { ErrorParams } from './error-code.types';
import { resolveErrorDefinition } from './error-registry';

/** Throw this for business errors. Status and message come from the error registry by `code`. */
export class DomainException extends HttpException {
  readonly code: string;

  constructor(
    code: string,
    options?: {
      readonly params?: ErrorParams;
      readonly details?: unknown[];
    },
  ) {
    const definition = resolveErrorDefinition(code);
    const message = interpolate(definition.message, options?.params);
    super(
      {
        code: definition.code,
        message,
        ...(options?.details ? { details: options.details } : {}),
      },
      definition.httpStatus,
    );
    this.code = definition.code;
  }
}

/** Replace `{key}` tokens in `template` with values from `params`. */
function interpolate(template: string, params?: ErrorParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  );
}
