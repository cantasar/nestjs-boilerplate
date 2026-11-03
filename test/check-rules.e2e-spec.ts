// Runs scripts/check-rules.mjs on small sample files written to a temp folder.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'check-rules.mjs');

let dir: string;

/** Writes a sample file; the name may contain folders like `enums/role.enum.ts`. */
function sample(name: string, source: string): string {
  const path = join(dir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source, 'utf8');
  return path;
}

function runRules(...files: string[]): { code: number | null; output: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...files], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'check-rules-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scripts/check-rules.mjs', () => {
  it('passes the real src/ tree', () => {
    const { code, output } = runRules();
    expect({ code, output }).toEqual({ code: 0, output: '' });
  });

  // L8: `any` is now an oxlint error. Checked on a sample with the repo's .oxlintrc.json.
  it('oxlint refuses an explicit any with the repo config', () => {
    const file = sample(
      'explicit-any.ts',
      'export function f(value: any): number {\n  return Number(value);\n}\n',
    );
    const result = spawnSync(
      join(ROOT, 'node_modules', '.bin', 'oxlint'),
      ['-c', join(ROOT, '.oxlintrc.json'), file],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/no-explicit-any/);
  });

  it('passes clean files', () => {
    const files = [
      sample('login.dto.ts', 'export class LoginDto {\n  email: string;\n}\n'),
      sample('enums/role.enum.ts', "export enum Role {\n  A = 'a',\n}\n"),
      sample(
        'users.repository.ts',
        "import { DATABASE_TOKENS } from './db';\nexport class UsersRepository {}\n",
      ),
      sample('notes.md', 'export enum A {}\nexport enum B {}\n'),
    ];
    expect(runRules(...files).code).toBe(0);
  });

  it.each([
    [
      'two DTO classes in one *.dto.ts',
      'user.dto.ts',
      'export class A {}\nexport class B {}\n',
      'One class per *.dto.ts file',
    ],
    [
      'a second DTO that is abstract',
      'base.dto.ts',
      'export abstract class Base {}\nexport class A extends Base {}\n',
      'One class per *.dto.ts file',
    ],
    [
      'a second DTO that is not exported',
      'hidden.dto.ts',
      'class Inner {}\nexport class A {}\n',
      'One class per *.dto.ts file',
    ],
    [
      'an enum outside a *.enum.ts file',
      'status.constants.ts',
      "export enum Status { A = 'a' }\n",
      'Enums live in enums/<name>.enum.ts files',
    ],
    [
      'a const enum outside a *.enum.ts file',
      'flags.service.ts',
      'export const enum Flag { A }\n',
      'Enums live in enums/<name>.enum.ts files',
    ],
    [
      '`as unknown as` with extra spaces',
      'spaced.ts',
      'const a = 1 as  unknown   as string;\n',
      'No `as unknown as`',
    ],
    [
      '`as unknown as` across lines',
      'wrapped.ts',
      'const a = 1 as\n  unknown as\n  string;\n',
      'No `as unknown as`',
    ],
    [
      '`as  never` with extra spaces',
      'spaced-never.ts',
      'const a = 1 as   never;\n',
      'No `as never`',
    ],
    [
      'two enums in one file',
      'status.enum.ts',
      "export enum A { X = 'x' }\nexport enum B { Y = 'y' }\n",
      'One enum per file',
    ],
    [
      'two const enums in one file',
      'flags.ts',
      'export const enum A { X }\nexport const enum B { Y }\n',
      'One enum per file',
    ],
    [
      '`as unknown as` cast',
      'cast.ts',
      'const a = 1 as unknown as string;\n',
      'No `as unknown as`',
    ],
    ['`as never` cast', 'never.ts', 'const a = 1 as never;\n', 'No `as never`'],
    [
      'Promise<any>',
      'any.ts',
      'export async function f(): Promise<any> {}\n',
      'No `Promise<any>`',
    ],
    [
      'Promise< unknown >',
      'unknown.ts',
      'export async function f(): Promise< unknown > {}\n',
      'No `Promise<any>`',
    ],
    [
      'database token in a service',
      'users.service.ts',
      "import { DATABASE_TOKENS } from './db';\n",
      'No database token in a *.service.ts',
    ],
  ])('fails on %s', (_label, name, source, rule) => {
    const file = sample(name, source);
    const { code, output } = runRules(file);
    expect(code).toBe(1);
    expect(output).toContain(`${file}: ${rule}`);
  });

  it('lets specs use mock casts, but not two enums', () => {
    const castSpec = sample(
      'mocks.spec.ts',
      'const a = {} as unknown as string;\nconst b = 1 as never;\n',
    );
    expect(runRules(castSpec).code).toBe(0);

    const enumSpec = sample(
      'enums.spec.ts',
      'export enum A { X }\nexport enum B { Y }\n',
    );
    expect(runRules(enumSpec).code).toBe(1);
  });

  it('allows one DTO class with a decorator, and a word like "class" in a comment', () => {
    const files = [
      sample(
        'decorated.dto.ts',
        "import { ApiProperty } from '@nestjs/swagger';\n// This class holds one field.\nexport class A {\n  @ApiProperty()\n  a: string;\n}\n",
      ),
      sample('enums/role-two.enum.ts', "export enum Role {\n  A = 'a',\n}\n"),
    ];
    expect(runRules(...files).code).toBe(0);
  });

  it('does not count a word that only contains "enum" or "class"', () => {
    const file = sample(
      'words.ts',
      'export const enumerate = 1;\nexport const classic = 2;\n',
    );
    expect(runRules(file).code).toBe(0);
  });

  // L25: the rule says "enums/<name>.enum.ts", so the folder counts too, not only the suffix.
  it('fails on an enum file outside an enums/ folder', () => {
    const file = sample('loose.enum.ts', "export enum Loose { A = 'a' }\n");
    const { code, output } = runRules(file);
    expect(code).toBe(1);
    expect(output).toContain(
      `${file}: Enums live in enums/<name>.enum.ts files`,
    );
  });

  it('fails on an enum in an enums/ folder without the .enum.ts suffix', () => {
    const file = sample('enums/status.ts', "export enum Status { A = 'a' }\n");
    expect(runRules(file).code).toBe(1);
  });

  it('does not take a folder that only ends in "enums" as the enums/ folder', () => {
    const file = sample(
      'myenums/status.enum.ts',
      "export enum Status { A = 'a' }\n",
    );
    expect(runRules(file).code).toBe(1);
  });

  it('passes an enum in a nested enums/ folder', () => {
    const file = sample(
      'modules/x/enums/status.enum.ts',
      "export enum Status { A = 'a' }\n",
    );
    expect(runRules(file).code).toBe(0);
  });

  it('reports every failing file in one run', () => {
    const first = sample('a.dto.ts', 'export class A {}\nexport class B {}\n');
    const second = sample('b.service.ts', 'const DRIZZLE = 1;\n');
    const { code, output } = runRules(first, second);
    expect(code).toBe(1);
    expect(output).toContain(first);
    expect(output).toContain(second);
  });
});
