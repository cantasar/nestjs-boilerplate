#!/usr/bin/env node
// Generate per-tag markdown documentation from an OpenAPI spec.
// Usage: node scripts/generate-api-docs.mjs [openapi-json-path] [output-dir]

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SPEC_PATH = process.argv[2] ?? join(ROOT, 'docs/api/openapi.json');
const OUT_DIR = process.argv[3] ?? join(ROOT, 'docs/api');

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));

// ─── ref resolver ────────────────────────────────────────────────────────────

function resolveRef(ref) {
  if (!ref?.startsWith('#/')) return null;
  const path = ref.slice(2).split('/');
  let cur = spec;
  for (const seg of path) {
    cur = cur?.[seg];
    if (cur === undefined) return null;
  }
  return cur;
}

function inlineRefs(node, seen = new Set()) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => inlineRefs(n, seen));
  if (node.$ref) {
    if (seen.has(node.$ref)) return { $circular: node.$ref };
    const resolved = resolveRef(node.$ref);
    if (!resolved) return node;
    const next = new Set(seen);
    next.add(node.$ref);
    return inlineRefs(resolved, next);
  }
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = inlineRefs(v, seen);
  return out;
}

// ─── slug ────────────────────────────────────────────────────────────────────

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── schema → readable summary ──────────────────────────────────────────────

function schemaSummary(schema, depth = 0) {
  if (!schema) return '_none_';
  const s = inlineRefs(schema);
  return renderSchema(s, depth);
}

function renderSchema(s, depth) {
  if (!s || typeof s !== 'object') return String(s);
  if (s.$circular) return `_(circular: ${s.$circular})_`;
  const indent = '  '.repeat(depth);

  if (s.oneOf || s.anyOf || s.allOf) {
    const arr = s.oneOf ?? s.anyOf ?? s.allOf;
    const label = s.oneOf ? 'oneOf' : s.anyOf ? 'anyOf' : 'allOf';
    return `${label}:\n${arr
      .map((sub) => `${indent}  - ${renderSchema(sub, depth + 1).trim()}`)
      .join('\n')}`;
  }

  if (s.type === 'array') {
    const inner = renderSchema(s.items ?? {}, depth + 1).trim();
    return `array<${inner}>`;
  }

  if (s.type === 'object' || s.properties) {
    const required = new Set(s.required ?? []);
    const props = s.properties ?? {};
    const lines = Object.entries(props).map(([key, val]) => {
      const req = required.has(key) ? ' *(required)*' : '';
      const desc = val.description ? ` — ${val.description}` : '';
      const ex =
        val.example !== undefined
          ? ` (example: \`${typeof val.example === 'string' ? val.example : JSON.stringify(val.example)}\`)`
          : '';
      const inner = renderSchema(val, depth + 1).trim();
      return `${indent}- \`${key}\`: ${inner}${req}${desc}${ex}`;
    });
    return `object\n${lines.join('\n')}`;
  }

  const t = s.type ?? 'any';
  const enumStr = s.enum
    ? ` enum=[${s.enum.map((e) => JSON.stringify(e)).join(', ')}]`
    : '';
  const fmt = s.format ? ` (${s.format})` : '';
  const nul = s.nullable ? ' nullable' : '';
  const def =
    s.default !== undefined ? ` default=${JSON.stringify(s.default)}` : '';
  return `${t}${fmt}${enumStr}${nul}${def}`;
}

// ─── group operations by tag ─────────────────────────────────────────────────

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
const tagOps = new Map();
const untagged = [];

for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  for (const m of METHODS) {
    const op = pathItem[m];
    if (!op) continue;
    const entry = { method: m.toUpperCase(), path, op };
    const tags = op.tags?.length ? op.tags : null;
    if (!tags) {
      untagged.push(entry);
      continue;
    }
    for (const t of tags) {
      if (!tagOps.has(t)) tagOps.set(t, []);
      tagOps.get(t).push(entry);
    }
  }
}

// ─── render single op ────────────────────────────────────────────────────────

function renderOp({ method, path, op }) {
  const lines = [];
  const summary =
    (op.summary || '').trim() ||
    (op.description || '').split('\n')[0]?.trim() ||
    '(no summary)';
  lines.push(`### \`${method} ${path}\``);
  lines.push('');
  if (summary) lines.push(`> ${summary}`);
  lines.push('');

  // Auth
  const security = op.security ?? spec.security;
  if (security?.length) {
    const schemes = security
      .flatMap((s) => Object.keys(s))
      .filter((k, i, a) => a.indexOf(k) === i);
    lines.push(`**Auth:** ${schemes.join(', ')}`);
    lines.push('');
  } else {
    lines.push('**Auth:** none / public');
    lines.push('');
  }

  // Path / query / header params
  const params = op.parameters ?? [];
  if (params.length) {
    lines.push('**Parameters:**');
    lines.push('');
    lines.push('| Name | In | Type | Required | Description |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const p of params) {
      const sch = p.schema
        ? renderSchema(inlineRefs(p.schema), 0).split('\n')[0]
        : '';
      const desc = (p.description ?? '').replace(/\n/g, ' ');
      lines.push(
        `| \`${p.name}\` | ${p.in} | ${sch} | ${p.required ? 'yes' : 'no'} | ${desc} |`,
      );
    }
    lines.push('');
  }

  // Request body
  if (op.requestBody) {
    lines.push('**Request body:**');
    lines.push('');
    const content = op.requestBody.content ?? {};
    for (const [mt, body] of Object.entries(content)) {
      lines.push(`- Content-Type: \`${mt}\``);
      const s = body.schema ? schemaSummary(body.schema, 0) : '_none_';
      lines.push('');
      lines.push('```');
      lines.push(s);
      lines.push('```');
      if (body.example) {
        lines.push('Example:');
        lines.push('```json');
        lines.push(JSON.stringify(body.example, null, 2));
        lines.push('```');
      }
    }
    lines.push('');
  }

  // Responses
  const responses = op.responses ?? {};
  if (Object.keys(responses).length) {
    lines.push('**Responses:**');
    lines.push('');
    for (const [code, resp] of Object.entries(responses)) {
      const desc = resp.description ?? '';
      lines.push(`- \`${code}\` ${desc}`);
      const content = resp.content ?? {};
      for (const [mt, body] of Object.entries(content)) {
        const s = body.schema ? schemaSummary(body.schema, 0) : '_none_';
        lines.push(`  - \`${mt}\``);
        lines.push('    ```');
        lines.push(
          s
            .split('\n')
            .map((l) => '    ' + l)
            .join('\n'),
        );
        lines.push('    ```');
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── render tag file ─────────────────────────────────────────────────────────

function renderTagFile(tag, ops) {
  const lines = [];
  lines.push(`# ${tag}`);
  lines.push('');
  lines.push(
    `> ${spec.info?.title ?? 'API'} — \`${tag}\` module endpoint documentation.`,
  );
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Servers
  if (spec.servers?.length) {
    lines.push('## Servers');
    lines.push('');
    for (const sv of spec.servers) {
      lines.push(`- ${sv.description ?? ''}: \`${sv.url}\``);
    }
    lines.push('');
  }

  // Endpoint list
  lines.push('## Endpoints');
  lines.push('');
  lines.push('| Method | Path | Summary |');
  lines.push('| --- | --- | --- |');
  for (const e of ops) {
    const summary = (
      (e.op.summary || '').trim() ||
      (e.op.description || '').split('\n')[0]?.trim() ||
      ''
    ).replace(/\|/g, '\\|');
    lines.push(`| \`${e.method}\` | \`${e.path}\` | ${summary} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Detail
  for (const e of ops) {
    lines.push(renderOp(e));
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// ─── write files ─────────────────────────────────────────────────────────────

// Clean ONLY files this script wrote on a previous run, tracked in a manifest —
// never pattern-match filenames (that risked deleting a handwritten doc whose
// name happened to look generated). Handwritten docs are untouched.
const MANIFEST_PATH = join(OUT_DIR, '.generated-manifest.json');
try {
  const fs = await import('fs');
  const prev = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (Array.isArray(prev)) {
    for (const name of prev) {
      const target = join(OUT_DIR, name);
      if (fs.existsSync(target)) rmSync(target);
    }
  }
} catch {
  // No manifest yet — first run, nothing to clean.
}

mkdirSync(OUT_DIR, { recursive: true });

const generated = [];
for (const [tag, ops] of [...tagOps.entries()].sort()) {
  ops.sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
  const file = `${slugify(tag)}.md`;
  writeFileSync(join(OUT_DIR, file), renderTagFile(tag, ops));
  generated.push({ tag, file, count: ops.length });
}

if (untagged.length) {
  untagged.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(
    join(OUT_DIR, 'untagged.md'),
    renderTagFile('Untagged', untagged),
  );
  generated.push({
    tag: 'Untagged',
    file: 'untagged.md',
    count: untagged.length,
  });
}

// README index
const readme = [];
readme.push(`# ${spec.info?.title ?? 'API'} — Module Documentation`);
readme.push('');
readme.push(`> ${spec.info?.description ?? ''}`);
readme.push(`> Version: ${spec.info?.version ?? 'n/a'}`);
readme.push(`> Generated: ${new Date().toISOString()}`);
readme.push('');
readme.push('Source OpenAPI spec: [`openapi.json`](./openapi.json)');
readme.push('');
readme.push('## Modules');
readme.push('');
readme.push('| Module | Endpoint count | File |');
readme.push('| --- | --- | --- |');
for (const g of generated) {
  readme.push(`| ${g.tag} | ${g.count} | [\`${g.file}\`](./${g.file}) |`);
}
readme.push('');
readme.push('## How to regenerate');
readme.push('');
readme.push('```bash');
readme.push('# 1. Start the server: pnpm start');
readme.push('# 2. Fetch the spec + generate docs:');
readme.push(
  'curl -sS http://localhost:3000/api/v1/docs/openapi.json -o docs/api/openapi.json',
);
readme.push('node scripts/generate-api-docs.mjs');
readme.push('```');
readme.push('');

writeFileSync(join(OUT_DIR, 'README.md'), readme.join('\n'));

// ─── Enum docs ──────────────────────────────────────────────────────────────

import { readdirSync, statSync } from 'fs';

function findEnumFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const st = statSync(p);
    if (st.isDirectory()) out.push(...findEnumFiles(p));
    else if (
      entry.endsWith('.enum.ts') ||
      entry.endsWith('.schema.ts') ||
      entry.endsWith('.ts')
    ) {
      // Cheap pre-filter: only keep files mentioning enum/pgEnum to skip irrelevant TS files.
      const src = readFileSync(p, 'utf8');
      if (/export\s+enum\s+\w+|pgEnum\s*\(/.test(src)) out.push(p);
    }
  }
  return out;
}

function parseEnums(filePath, src) {
  const enums = [];
  // TS enum: `export enum Name { K = 'V', ... }` or numeric.
  const tsRe = /export\s+enum\s+(\w+)\s*{([^}]*)}/g;
  let m;
  while ((m = tsRe.exec(src)) !== null) {
    const name = m[1];
    const body = m[2];
    const members = [];
    const memberRe = /(\w+)\s*=\s*(['"`])([^'"`]+)\2|\b(\w+)\s*=\s*(-?\d+)/g;
    let mm;
    while ((mm = memberRe.exec(body)) !== null) {
      if (mm[1]) members.push({ key: mm[1], value: mm[3] });
      else members.push({ key: mm[4], value: mm[5] });
    }
    enums.push({ name, kind: 'ts', members, source: filePath });
  }
  // Drizzle: `export const xEnum = pgEnum('name', ['a','b']);`
  const drizzleRe =
    /export\s+const\s+(\w+)\s*=\s*pgEnum\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\[([^\]]+)\]\s*\)/g;
  while ((m = drizzleRe.exec(src)) !== null) {
    const name = m[1];
    const dbName = m[2];
    const valuesRaw = m[3];
    const members = [];
    const valRe = /['"`]([^'"`]+)['"`]/g;
    let vm;
    while ((vm = valRe.exec(valuesRaw)) !== null) {
      members.push({ key: vm[1], value: vm[1] });
    }
    enums.push({ name, kind: 'pgEnum', dbName, members, source: filePath });
  }
  return enums;
}

const SRC_DIR = join(ROOT, 'src');
const enumFiles = findEnumFiles(SRC_DIR);
const allEnums = [];
for (const f of enumFiles) {
  const src = readFileSync(f, 'utf8');
  const parsed = parseEnums(f, src);
  allEnums.push(...parsed);
}

// Deduplicate: when a TS enum and a pgEnum share the same value-set, fold the
// pgEnum into the TS entry as an alias (DB name + source). Client tooling keys
// off TS enum names; the DB alias is informational.
function valueFingerprint(e) {
  return e.members
    .map((m) => String(m.value))
    .sort()
    .join('|');
}

const merged = [];
const tsByFingerprint = new Map();
for (const e of allEnums.filter((x) => x.kind === 'ts')) {
  tsByFingerprint.set(valueFingerprint(e), e);
}

for (const e of allEnums) {
  if (e.kind === 'pgEnum') {
    const tsTwin = tsByFingerprint.get(valueFingerprint(e));
    if (tsTwin) {
      tsTwin.aliases ??= [];
      tsTwin.aliases.push({
        name: e.name,
        dbName: e.dbName,
        source: e.source,
      });
      continue;
    }
  }
  merged.push(e);
}

merged.sort((a, b) => a.name.localeCompare(b.name));
const dedupedEnums = merged;

const enumLines = [];
enumLines.push('# Enum Dictionary');
enumLines.push('');
enumLines.push(
  '> Enum definitions extracted from the codebase. All enum values with a client-side counterpart are listed here.',
);
enumLines.push(`> Generated: ${new Date().toISOString()}`);
enumLines.push('');
enumLines.push('## List');
enumLines.push('');
enumLines.push('| Enum | Kind | Members | Source |');
enumLines.push('| --- | --- | --- | --- |');
for (const e of dedupedEnums) {
  const rel = e.source.replace(ROOT + '/', '');
  enumLines.push(
    `| [\`${e.name}\`](#${slugify(e.name)}) | ${e.kind} | ${e.members.length} | \`${rel}\` |`,
  );
}
enumLines.push('');

for (const e of dedupedEnums) {
  enumLines.push(`## ${e.name}`);
  enumLines.push('');
  if (e.kind === 'pgEnum') {
    enumLines.push(`Postgres enum (\`${e.dbName}\`) — defined via Drizzle.`);
    enumLines.push('');
  }
  enumLines.push(`Source: \`${e.source.replace(ROOT + '/', '')}\``);
  if (e.aliases?.length) {
    enumLines.push('');
    enumLines.push('Aliases (same value set):');
    for (const a of e.aliases) {
      const rel = a.source.replace(ROOT + '/', '');
      enumLines.push(
        `- \`${a.name}\`${a.dbName ? ` (Postgres: \`${a.dbName}\`)` : ''} — \`${rel}\``,
      );
    }
  }
  enumLines.push('');
  enumLines.push('| Key | Value |');
  enumLines.push('| --- | --- |');
  for (const m of e.members) {
    enumLines.push(`| \`${m.key}\` | \`${m.value}\` |`);
  }
  enumLines.push('');
}

writeFileSync(join(OUT_DIR, 'enums.md'), enumLines.join('\n'));

// Append enum entry to README
const enumReadmeLines = readFileSync(join(OUT_DIR, 'README.md'), 'utf8').split(
  '\n',
);
const insertAt = enumReadmeLines.findIndex((l) =>
  l.startsWith('## How to regenerate'),
);
const enumsBlock = [
  '## Enum Dictionary',
  '',
  `All enum values with a client-side counterpart: [\`enums.md\`](./enums.md) (${dedupedEnums.length} enums).`,
  '',
];
if (insertAt > 0) {
  enumReadmeLines.splice(insertAt, 0, ...enumsBlock);
} else {
  enumReadmeLines.push(...enumsBlock);
}
writeFileSync(join(OUT_DIR, 'README.md'), enumReadmeLines.join('\n'));

// Record every file written this run so the next run cleans exactly these.
const manifest = [...generated.map((g) => g.file), 'README.md', 'enums.md'];
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

console.log(
  `Generated ${generated.length} module files + 1 enum file in ${OUT_DIR}`,
);
for (const g of generated)
  console.log(`  ${g.file} — ${g.tag} (${g.count} endpoints)`);
console.log(
  `  enums.md — ${dedupedEnums.length} enums (deduped from ${allEnums.length})`,
);
