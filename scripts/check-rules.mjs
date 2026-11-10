#!/usr/bin/env node
// Project rules that oxlint does not cover. Usage: `node scripts/check-rules.mjs [files...]` (default: all of src/).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENUM = /^(export\s+)?(declare\s+)?(const\s+)?enum\s/gm;

const RULES = [
  {
    name: 'No `as unknown as` double cast (tests may use it for mocks)',
    skipSpecs: true,
    test: (src) => /\bas\s+unknown\s+as\b/.test(src),
  },
  {
    name: 'No `as never` cast, use a literal union type',
    skipSpecs: true,
    test: (src) => /\bas\s+never\b/.test(src),
  },
  {
    name: 'No `Promise<any>` or `Promise<unknown>`, give the real type',
    skipSpecs: true,
    test: (src) => /Promise<\s*(any|unknown)\s*>/.test(src),
  },
  {
    name: 'One class per *.dto.ts file',
    only: /\.dto\.ts$/,
    test: (src) =>
      (src.match(/^(export\s+)?(abstract\s+)?class\s/gm) ?? []).length > 1,
  },
  {
    name: 'One enum per file',
    test: (src) => (src.match(ENUM) ?? []).length > 1,
  },
  {
    name: 'Enums live in enums/<name>.enum.ts files',
    skipSpecs: true,
    test: (src, file) =>
      !/(^|\/)enums\/[^/]+\.enum\.ts$/.test(file.split('\\').join('/')) &&
      ENUM.test(src),
  },
  {
    name: 'No database token in a *.service.ts, use a repository',
    skipSpecs: true,
    only: /\.service\.ts$/,
    test: (src) => /DATABASE_TOKENS|DRIZZLE/.test(src),
  },
];

function collect(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? collect(full) : [full];
  });
}

const args = process.argv.slice(2);
const files = (args.length > 0 ? args : collect('src')).filter((f) =>
  f.endsWith('.ts'),
);

const failures = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const isSpec = /\.spec\.ts$|e2e-spec\.ts$/.test(file);
  for (const rule of RULES) {
    if (rule.skipSpecs && isSpec) continue;
    if (rule.only && !rule.only.test(file)) continue;
    // The shared ENUM regex is global, so reset it before each use.
    ENUM.lastIndex = 0;
    if (rule.test(src, file)) failures.push(`${file}: ${rule.name}`);
  }
}

if (failures.length > 0) {
  console.error('✗ Project rule check failed:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
