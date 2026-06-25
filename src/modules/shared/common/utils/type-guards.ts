/**
 * Runtime type guards for narrowing `unknown` values past validation /
 * deserialization boundaries. Use these in validators, JSONB readers, and
 * audit-log decoders instead of ad-hoc `as Record<string, unknown>` casts.
 */

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringRecord(
  value: unknown,
): value is Record<string, string> {
  if (!isObject(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

export function hasKey<K extends string>(
  value: unknown,
  key: K,
): value is Record<K, unknown> {
  return isObject(value) && key in value;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type-safe `Array.includes` for heterogeneous-element arrays where the
 * element type is wider than the comparand. Standard `arr.includes(x)`
 * fails type-check when `arr: T[]` and `x: U` even if `U extends T`
 * (invariance). Use this helper instead of `(arr as unknown[]).includes(x)`.
 */
export function arrayIncludes<T>(arr: readonly T[], value: unknown): boolean {
  return (arr as readonly unknown[]).includes(value);
}
