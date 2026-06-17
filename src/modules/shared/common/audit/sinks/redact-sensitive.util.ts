/**
 * Pure redaction helper for audit snapshots. Strips fields whose key matches a
 * sensitive pattern (passwords, tokens, OTPs, card data) before persistence,
 * recursing through nested objects/arrays and guarding against cycles.
 */
const SENSITIVE_FIELD_PATTERNS: RegExp[] = [
  /password/i,
  /passwd/i,
  /token/i,
  /^secret$/i,
  /apikey/i,
  /api_key/i,
  /authorization/i,
  /^otp$/i,
  /otp[_-]?code/i,
  /verification[_-]?code/i,
  /reset[_-]?code/i,
  /privatekey/i,
  /private_key/i,
  /credit[_-]?card/i,
  /card[_-]?number/i,
  /cvv/i,
  /ssn/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

function redactSensitive(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return value.map((item) => redactSensitive(item, seen));
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSensitiveKey(k)) continue;
      out[k] = redactSensitive(v, seen);
    }
    return out;
  }
  return value;
}

export function redactSnapshot(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (value === null || value === undefined) return value;
  return redactSensitive(value) as Record<string, unknown>;
}
