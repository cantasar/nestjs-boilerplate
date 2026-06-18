import { HttpException } from '@nestjs/common';
import type { ErrorParams } from './error-code.types';
import { resolveErrorDefinition } from './error-registry';

/**
 * Thrown for every meaningful domain error. Constructed from a stable machine
 * `code`; the matching `{ httpStatus, message }` is resolved from the central
 * error registry, so the same failure always maps to the same status + message.
 *
 * Pure / no DI — the global `HttpExceptionFilter` is `new`-instantiated in
 * `main.ts` (not an `APP_FILTER` provider), so the error machinery must not
 * depend on the Nest container. The exception embeds `code` into the
 * `HttpException` response payload, which the filter reads to build the envelope.
 *
 * Prefer constructing via a per-domain factory over `new DomainException(...)`
 * at call sites, so the catalog stays the single source of truth.
 */
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
