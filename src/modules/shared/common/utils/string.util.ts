// Combining diacritical marks (Unicode block U+0300–U+036F), stripped after
// NFKD normalization to fold accented Latin letters down to ASCII.
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Generate a URL-friendly slug: strips diacritics (via Unicode NFKD
 * normalization), lowercases, and collapses non-word runs into single hyphens.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove all non-word chars except spaces / hyphens
    .replace(/[\s_-]+/g, '-') // collapse whitespace / underscores into a hyphen
    .replace(/^-+|-+$/g, ''); // trim leading / trailing hyphens
}
