// Checks the AI credit block in the commit-msg hook (task commitlint-no-ai-credit).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const ROOT = join(__dirname, '..');
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function writeMsg(message: string): string {
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, message);
  return file;
}

/** Runs only the AI credit script. */
function check(message: string): { code: number | null; out: string } {
  const res = spawnSync(
    process.execPath,
    ['scripts/check-commit-msg.mjs', writeMsg(message)],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

/** Runs the hook file the way husky does: `sh -e` with node_modules/.bin on PATH. */
function hook(message: string): number | null {
  const PATH = `${join(ROOT, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}`;
  const res = spawnSync('sh', ['-e', '.husky/commit-msg', writeMsg(message)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PATH },
  });
  return res.status;
}

describe('check-commit-msg: blocks AI credit', () => {
  it.each([
    ['Claude Code trailer', `feat: add x\n\n${TRAILER}\n`],
    [
      'lower-case trailer',
      'feat: add x\n\nco-authored-by: claude <noreply@anthropic.com>\n',
    ],
    ['plain Claude trailer', 'feat: add x\n\nCo-authored-by: Claude <x@y.z>\n'],
    [
      'Claude Code name',
      'feat: add x\n\nCo-Authored-By: Claude Code <c@x.io>\n',
    ],
    [
      'model name with context note',
      'feat: add x\n\nCo-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>\n',
    ],
    [
      'Anthropic noreply email',
      'feat: add x\n\nCo-Authored-By: Bot <noreply@anthropic.com>\n',
    ],
    [
      'robot footer',
      'feat: add x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n',
    ],
    ['plain footer', 'feat: add x\n\nGenerated with Claude Code\n'],
    ['CRLF line ends', `feat: add x\r\n\r\n${TRAILER}\r\n`],
    ['no space after colon', 'feat: add x\n\nCo-Authored-By:Claude <c@a.b>\n'],
    ['indented trailer', `feat: add x\n\n  ${TRAILER}\n`],
    ['merge commit', `Merge branch 'dev'\n\n${TRAILER}\n`],
    [
      'revert commit',
      `Revert "feat: add x"\n\nThis reverts commit abc1234.\n\n${TRAILER}\n`,
    ],
    ['squash! commit', `squash! feat: add x\n\n${TRAILER}\n`],
    ['fixup! commit', `fixup! feat: add x\n\n${TRAILER}\n`],
    [
      'trailer above the scissors line',
      `feat: add x\n\n${TRAILER}\n# ------------------------ >8 ------------------------\ndiff\n`,
    ],
  ])('rejects %s', (_name, message) => {
    const { code, out } = check(message);
    expect(code).toBe(1);
    expect(out).toContain('AI credit');
  });
});

describe('check-commit-msg: lets normal messages through', () => {
  it.each([
    ['plain conventional commit', 'feat(auth): add apple login\n'],
    [
      'human co-author',
      'feat: add x\n\nCo-Authored-By: Jane Doe <jane@example.com>\n',
    ],
    [
      'human named Claude',
      'feat: add x\n\nCo-Authored-By: Claude Dupont <claude.dupont@example.com>\n',
    ],
    [
      'human with Claude as last name',
      'feat: add x\n\nCo-Authored-By: Jean Claude <jc@example.com>\n',
    ],
    [
      'human named Claudette',
      'feat: add x\n\nCo-Authored-By: Claudette <c@example.com>\n',
    ],
    [
      'human at a company with anthropic in the domain',
      'feat: add x\n\nCo-Authored-By: Ana <ana@anthropic-tools.io>\n',
    ],
    [
      '.claude folder in subject',
      'chore: update .claude/hooks guard for claude code\n',
    ],
    [
      'phrase in the middle of the subject',
      'docs: note files generated with Claude Code templates\n',
    ],
    [
      'AI trailer only in a git comment',
      `feat: add x\n\n# ${TRAILER}\n# Please enter the commit message.\n`,
    ],
    [
      'git commit -v diff below the scissors line',
      'feat: add x\n\n# ------------------------ >8 ------------------------\n' +
        '# Do not modify or remove the line above.\n' +
        'diff --git a/CLAUDE.md b/CLAUDE.md\n+1. no "Generated with Claude Code".\n' +
        `+${TRAILER}\n`,
    ],
    ['empty message', ''],
  ])('accepts %s', (_name, message) => {
    expect(check(message).code).toBe(0);
  });

  it('exits 2 with usage when no file is given', () => {
    const res = spawnSync(process.execPath, ['scripts/check-commit-msg.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('Usage');
  });
});

describe('.husky/commit-msg hook', () => {
  it('rejects a merge commit with an AI trailer', () => {
    expect(hook(`Merge branch 'dev'\n\n${TRAILER}\n`)).not.toBe(0);
  });

  it('accepts a merge commit without AI credit', () => {
    expect(hook("Merge branch 'dev'\n")).toBe(0);
  });

  it('accepts a conventional commit with a human co-author', () => {
    expect(
      hook('feat: add x\n\nCo-Authored-By: Claude Dupont <cd@example.com>\n'),
    ).toBe(0);
  });

  it('still enforces Conventional Commits', () => {
    expect(hook('added stuff\n')).not.toBe(0);
  });
});
