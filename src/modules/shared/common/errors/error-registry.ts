import type { ErrorCodeDefinition } from './error-code.types';
import { AUTH_ERRORS, COMMON_ERRORS, USER_ERRORS } from './error-codes';
import { CommonErrorCode } from './enums/common-error-code.enum';

/** Every error catalog. Add a new `*_ERRORS` const here when a feature needs one. */
const CATALOGS: readonly Record<string, ErrorCodeDefinition>[] = [
  COMMON_ERRORS,
  AUTH_ERRORS,
  USER_ERRORS,
];

/** Merges all catalogs and fails at boot when two of them use the same code. */
function buildRegistry(
  catalogs: readonly Record<string, ErrorCodeDefinition>[],
): Readonly<Record<string, ErrorCodeDefinition>> {
  const registry: Record<string, ErrorCodeDefinition> = {};
  for (const catalog of catalogs) {
    for (const definition of Object.values(catalog)) {
      if (registry[definition.code]) {
        throw new Error(
          `Duplicate error code "${definition.code}" detected across error catalogs. Codes must be globally unique.`,
        );
      }
      registry[definition.code] = definition;
    }
  }
  return registry;
}

export const ERROR_REGISTRY: Readonly<Record<string, ErrorCodeDefinition>> =
  buildRegistry(CATALOGS);

export const ALL_ERROR_CODES: readonly string[] = Object.keys(ERROR_REGISTRY);

/** Finds a definition by code. Unknown codes fall back to the internal error. */
export function resolveErrorDefinition(code: string): ErrorCodeDefinition {
  return ERROR_REGISTRY[code] ?? COMMON_ERRORS[CommonErrorCode.INTERNAL_ERROR];
}
