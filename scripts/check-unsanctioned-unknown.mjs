#!/usr/bin/env node
// Guard: every `: unknown` in production code must be a sanctioned boundary.
// Allowlisted files (class-validator validators, type-guards, the global
// exception filter, the audit machinery) are skipped wholesale — `unknown` is
// inherent there. Everywhere else, a `: unknown` annotation must carry a
// `// boundary: validated` marker (same or adjacent line, since the formatter
// may move a trailing comment), or be given a concrete type.
// Spec files are exempt. Usage:
//   node scripts/check-unsanctioned-unknown.mjs            # scan src/
//   node scripts/check-unsanctioned-unknown.mjs <files...> # lint-staged
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// `: unknown` in type position only — followed (after optional spaces) by a type
// terminator or `[]`, so string literals like 'foo: unknown bar' don't match.
const PATTERN = /:\s*unknown\s*(\[\]|[;,)>}|=&]|$)/;
const SANCTION = /boundary: validated/;
const ALLOWLIST = [
  /\/validators\//,
  /type-guard/,
  /http-exception\.filter/,
  /\/audit\//,
];

const allowlisted = (file) => ALLOWLIST.some((re) => re.test(file));

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full));
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const args = process.argv
  .slice(2)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
const files = (args.length > 0 ? args : collect('src')).filter(
  (f) => !allowlisted(f),
);

const violations = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!PATTERN.test(lines[i])) continue;
    const windowText = [lines[i - 1], lines[i], lines[i + 1]]
      .filter(Boolean)
      .join('\n');
    if (SANCTION.test(windowText)) continue;
    violations.push(`${file}:${i + 1}: ${lines[i].trim()}`);
  }
}

if (violations.length > 0) {
  console.error(
    '✗ Unsanctioned `: unknown` in production code.\n' +
      '  Give it a concrete type, or mark a genuine boundary with a // boundary: validated comment.',
  );
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
