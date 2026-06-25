/** Sum the UTF-8 byte length of all string values in a localized record. */
export function byteSize(
  value: Record<string, string> | null | undefined,
): number {
  if (!value) return 0;
  let total = 0;
  for (const v of Object.values(value)) {
    if (typeof v === 'string') total += Buffer.byteLength(v, 'utf8');
  }
  return total;
}
