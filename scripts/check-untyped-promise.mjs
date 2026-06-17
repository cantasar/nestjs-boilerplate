#!/usr/bin/env node
// Guard: forbid untyped/no-result Promise types in production code.
// Bans Promise<void | unknown | undefined | any>. A deliberate no-result Promise
// may opt out with a `// void-ok` comment on the same line or an adjacent line
// (the formatter may move a trailing comment onto the following line).
// Spec files (*.spec.ts) are exempt. Usage:
//   node scripts/check-untyped-promise.mjs            # scan src/
//   node scripts/check-untyped-promise.mjs <files...> # scan given files (lint-staged)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERN = /Promise<\s*(void|unknown|undefined|any)\s*>/;
const ALLOW = /void-ok/;

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
const files = args.length > 0 ? args : collect('src');

const violations = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!PATTERN.test(lines[i])) continue;
    const windowText = [lines[i - 1], lines[i], lines[i + 1]]
      .filter(Boolean)
      .join('\n');
    if (ALLOW.test(windowText)) continue;
    violations.push(`${file}:${i + 1}: ${lines[i].trim()}`);
  }
}

if (violations.length > 0) {
  console.error(
    '✗ Forbidden untyped/no-result Promise<void|unknown|undefined|any>.\n' +
      '  Declare the concrete resolved type, or annotate a deliberate no-result with a // void-ok comment.',
  );
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
