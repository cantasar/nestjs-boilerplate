/**
 * IANA timezone helpers that lean on the platform-native `Intl` API instead of
 * pulling in `moment-timezone` / `date-fns-tz`. All functions are pure.
 *
 * GPS coordinate → timezone resolution is intentionally omitted; pulling in
 * `geo-tz` (~50 MB shapefiles) only makes sense per-project. Add it
 * downstream if you need that capability.
 */

/**
 * Return true when `tz` is a valid IANA timezone identifier
 * (e.g. `"Europe/Istanbul"`, `"America/New_York"`). Empty / whitespace strings
 * are rejected.
 */
export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== 'string' || tz.trim().length === 0) {
    return false;
  }
  try {
    // Constructor throws RangeError for unknown timezones.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Return the list of every IANA timezone the runtime knows about (Node 18+).
 * Useful for picker UIs or to warm a validation cache.
 */
export function listSupportedTimezones(): readonly string[] {
  return Intl.supportedValuesOf('timeZone');
}

/**
 * Get the current wall-clock time in the given IANA timezone as a `Date`
 * whose `getFullYear()` / `getHours()` etc. read in that zone.
 *
 * Falls back to UTC if `tz` is invalid (logged via the caller's preferred
 * mechanism — this helper stays log-free to keep it dependency-free).
 */
export function getCurrentTimeInTimezone(tz: string): Date {
  const zone = isValidTimezone(tz) ? tz : 'UTC';
  // `formatToParts` gives us each field in the target zone; we then construct
  // a Date in the local epoch that reads back as that wall-clock time when
  // viewed with `getHours()` etc.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const lookup = new Map(parts.map((p) => [p.type, p.value]));
  const year = Number(lookup.get('year'));
  const month = Number(lookup.get('month'));
  const day = Number(lookup.get('day'));
  // `hour` of "24" can appear in some locales — clamp.
  const hourRaw = Number(lookup.get('hour'));
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = Number(lookup.get('minute'));
  const second = Number(lookup.get('second'));
  return new Date(year, month - 1, day, hour, minute, second);
}

/**
 * Current UTC offset in minutes for the given timezone at the given moment.
 * Positive east of UTC (e.g. Istanbul = +180), negative west (NYC ≈ -240/-300).
 *
 * Returns 0 (UTC) when `tz` is invalid.
 */
export function getTimezoneOffsetMinutes(
  tz: string,
  at: Date = new Date(),
): number {
  if (!isValidTimezone(tz)) {
    return 0;
  }
  // Build "YYYY-MM-DDTHH:mm:ss" in the target zone, parse as if it were UTC,
  // and subtract from the real UTC epoch to derive the offset.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const lookup = new Map(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(lookup.get('year')),
    Number(lookup.get('month')) - 1,
    Number(lookup.get('day')),
    Number(lookup.get('hour')) === 24 ? 0 : Number(lookup.get('hour')),
    Number(lookup.get('minute')),
    Number(lookup.get('second')),
  );
  const offset = Math.round((asUtc - at.getTime()) / 60_000);
  // Normalize -0 → 0 so callers can `=== 0` safely.
  return offset === 0 ? 0 : offset;
}
