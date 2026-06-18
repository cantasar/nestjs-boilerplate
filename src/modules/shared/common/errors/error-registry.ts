import type { ErrorCodeDefinition } from './error-code.types';
import {
  AUTH_ERRORS,
  BUG_REPORT_ERRORS,
  COMMON_ERRORS,
  CommonErrorCode,
  LEGAL_DOCUMENTS_ERRORS,
  MEDIA_ERRORS,
  NOTIFICATION_ERRORS,
  STORAGE_ERRORS,
  USER_ERRORS,
} from './error-codes';

/**
 * Every per-domain catalog. Add new `*_ERRORS` consts here as features land.
 * These are the single source of truth; the registry below merges them and
 * enforces global code uniqueness at boot.
 */
const CATALOGS: readonly Record<string, ErrorCodeDefinition>[] = [
  COMMON_ERRORS,
  AUTH_ERRORS,
  USER_ERRORS,
  STORAGE_ERRORS,
  MEDIA_ERRORS,
  LEGAL_DOCUMENTS_ERRORS,
  BUG_REPORT_ERRORS,
  NOTIFICATION_ERRORS,
];

/**
 * Merge every catalog into one lookup, failing fast (at module load / boot) if
 * two catalogs declare the same `code`. A plain spread-merge would silently drop
 * the loser, so two domains accidentally sharing a code would ship a broken
 * client contract. Throwing here turns that into an un-bootable process instead.
 */
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

/**
 * Resolve a definition by code, falling back to the generic internal-error
 * definition for unknown codes so callers always get a usable status + message.
 */
export function resolveErrorDefinition(code: string): ErrorCodeDefinition {
  return ERROR_REGISTRY[code] ?? COMMON_ERRORS[CommonErrorCode.INTERNAL_ERROR];
}
