// UTF-8 byte-order mark. Prefixing an exported CSV with this makes Excel open
// the file as UTF-8 instead of the locale-default ANSI codepage, so non-ASCII
// characters render correctly.
export const EXPORT_BOM = '﻿';

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Render a single CSV cell: stringifies objects as JSON, quotes on
 * delimiter/quote/newline, and neutralises spreadsheet formula injection by
 * prefixing a single quote (a cell starting with =,+,-,@ would otherwise be
 * evaluated as a formula when opened in Excel/Sheets).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const safe = CSV_FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
