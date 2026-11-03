// Pipes PreToolUse JSON fixtures into .claude/hooks/guard.mjs: exit 2 = block, exit 0 = allow.
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const GUARD = join(ROOT, '.claude', 'hooks', 'guard.mjs');

type Who = Record<string, string>;
type Fixture = Record<string, unknown>;
type Expect = 'block' | 'allow';
type Case = [label: string, fixture: Fixture | string, expected: Expect];

const MAIN: Who = {};
const TESTER: Who = { agent_id: 'agent-test-1', agent_type: 'tester' };

// No path normalizing here, so `..` cases reach the guard as typed.
const abs = (path: string) => `${ROOT}/${path}`;
const read = (path: string, who = MAIN): Fixture => ({
  ...who,
  tool_name: 'Read',
  tool_input: { file_path: abs(path) },
});
const write = (path: string, who = MAIN): Fixture => ({
  ...who,
  tool_name: 'Write',
  tool_input: { file_path: abs(path), content: 'x' },
});
const edit = (path: string, who = MAIN): Fixture => ({
  ...who,
  tool_name: 'Edit',
  tool_input: { file_path: abs(path), old_string: 'a', new_string: 'b' },
});
const bash = (command: string, who = MAIN): Fixture => ({
  ...who,
  tool_name: 'Bash',
  tool_input: { command },
});
const grep = (input: Record<string, string>, who = MAIN): Fixture => ({
  ...who,
  tool_name: 'Grep',
  tool_input: { pattern: 'KEY', ...input },
});

const mcp = (tool: string, input: Record<string, string>, who = MAIN) => ({
  ...who,
  tool_name: tool,
  tool_input: input,
});

/** `env` overrides the guard's environment; an undefined value removes the variable. */
function outcome(
  fixture: Fixture | string,
  projectDir = ROOT,
  env: Record<string, string | undefined> = {},
): string {
  const result = spawnSync(process.execPath, [GUARD], {
    input: typeof fixture === 'string' ? fixture : JSON.stringify(fixture),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, ...env },
    encoding: 'utf8',
  });
  if (result.status === 2 && result.stderr.startsWith('Blocked by')) {
    return 'block';
  }
  if (result.status === 0 && result.stderr === '') return 'allow';
  const firstError =
    result.stderr.split('\n').find((line) => /Error/.test(line)) ?? '';
  return `exit ${result.status} ${firstError.trim()}`;
}

/** Runs every case and returns only the wrong ones, so one bug gives one readable failure. */
function wrongCases(cases: Case[]): string[] {
  return cases.flatMap(([label, fixture, expected]) => {
    const actual = outcome(fixture);
    return actual === expected
      ? []
      : [`${label}: expected ${expected}, got ${actual}`];
  });
}

const bashCases = (commands: string[], expected: Expect, who: Who): Case[] =>
  commands.map((command) => [
    `Bash \`${command}\``,
    bash(command, who),
    expected,
  ]);

describe('guard hook: env files', () => {
  it('blocks env files in the file tools, also for the tester', () => {
    expect(
      wrongCases([
        ['Read .env', read('.env'), 'block'],
        ['Read .env.local', read('.env.local'), 'block'],
        ['Read .env.production', read('.env.production'), 'block'],
        ['Read nested .env.test', read('config/.env.test'), 'block'],
        [
          'Read .env.development.local',
          read('.env.development.local'),
          'block',
        ],
        ['Edit .env', edit('.env'), 'block'],
        ['Write .env.staging', write('.env.staging'), 'block'],
        [
          'NotebookEdit .env',
          {
            tool_name: 'NotebookEdit',
            tool_input: { notebook_path: abs('.env') },
          },
          'block',
        ],
        ['Grep path .env', grep({ path: abs('.env') }), 'block'],
        ['Grep glob .env.local', grep({ glob: '.env.local' }), 'block'],
        ['tester Read .env', read('.env', TESTER), 'block'],
      ]),
    ).toEqual([]);
  });

  it('allows the template and normal files', () => {
    expect(
      wrongCases([
        ['Read .env.example', read('.env.example'), 'allow'],
        ['Edit .env.example', edit('.env.example'), 'allow'],
        ['Read src/main.ts', read('src/main.ts'), 'allow'],
        ['Grep src *.ts', grep({ path: abs('src'), glob: '*.ts' }), 'allow'],
      ]),
    ).toEqual([]);
  });

  // Bash env rules are the same for everyone. They run as the tester here, so the
  // main-agent crash (tested below) does not hide them.
  it('blocks Bash commands that name an env file', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'cat .env',
            'cat ./.env.local',
            'cat "$PWD/.env"',
            "cat '.env'",
            'source .env && echo $JWT_SECRET',
            'grep KEY .env.production',
            'cp .env.example .env',
            'docker compose --env-file .env up -d',
          ],
          'block',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });

  it('allows normal Bash commands', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'cat .env.example',
            'git status',
            'grep -n "process.env" src/main.ts',
            'node -e "console.log(process.env.HOME)"',
            "grep -rn --exclude='.env*' token src",
            'git grep KEY',
            'rg KEY src',
          ],
          'allow',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });

  it('blocks searches that also read ignored files (long flags)', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'grep -n -r SECRET .',
            'grep --recursive SECRET .',
            'rg --no-ignore KEY',
            'git grep --untracked KEY',
            'git grep --no-index KEY',
          ],
          'block',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });

  // Correction item (HIGH): a flag right after the command name is never matched,
  // so the most common form `grep -r X .` reads .env files.
  it('blocks recursive grep and unrestricted rg in their common short forms', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'grep -r SECRET .',
            'grep -Rn token .',
            'egrep -r token .',
            'rg -uu KEY',
            'rg -u KEY',
          ],
          'block',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });

  // Correction item (HIGH): `.env*` is not matched. ripgrep's -g glob even overrides
  // .gitignore, so the Grep tool with glob `.env*` reads the real file.
  it('blocks env globs', () => {
    expect(
      wrongCases([
        ['Bash `cat .env*`', bash('cat .env*', TESTER), 'block'],
        [
          'Bash `grep -h API_KEY .env*`',
          bash('grep -h API_KEY .env*', TESTER),
          'block',
        ],
        [
          "Bash `rg -g '.env*' KEY`",
          bash("rg -g '.env*' KEY", TESTER),
          'block',
        ],
        ['Grep tool, glob .env*', grep({ glob: '.env*' }), 'block'],
        ['Grep tool, glob **/.env*', grep({ glob: '**/.env*' }), 'block'],
      ]),
    ).toEqual([]);
  });

  // Correction item (MEDIUM): on macOS (case-insensitive disk) .ENV is the same file as .env.
  it('blocks env file names in any letter case', () => {
    expect(
      wrongCases([
        ['Read .ENV', read('.ENV'), 'block'],
        ['Read .Env.Local', read('.Env.Local'), 'block'],
        ['Bash cat .ENV', bash('cat .ENV'), 'block'],
        ['Grep glob .ENV', grep({ glob: '.ENV' }), 'block'],
      ]),
    ).toEqual([]);
  });

  // Run 2 fixes (H5, L9): quoting tricks, shell globs and dot-globs that the shell expands to .env.
  it('blocks env names hidden by quotes, escapes and globs, for everyone', () => {
    const commands = [
      'cat .e""nv',
      "cat .e''nv",
      'cat .en\\v',
      "cat $'.env'",
      'cat .en?',
      'cat .[e]nv',
      'cat .[!a]nv',
      'cat {.env,x}',
      'cat .*',
      'cat ./.e*',
      'cat .??v',
      'cat .E*',
      'head -c 100 .env.local',
    ];
    expect(
      wrongCases([
        ...bashCases(commands, 'block', MAIN),
        ...bashCases(commands, 'block', TESTER),
      ]),
    ).toEqual([]);
  });

  it('blocks Grep tool globs and rg globs that can match an env name', () => {
    expect(
      wrongCases([
        ['Grep glob .*', grep({ glob: '.*' }), 'block'],
        ['Grep glob .e*', grep({ glob: '.e*' }), 'block'],
        ['Grep glob .en?', grep({ glob: '.en?' }), 'block'],
        ['Grep glob {.env,x}', grep({ glob: '{.env,x}' }), 'block'],
        ['Grep glob *', grep({ glob: '*' }), 'block'],
        ['Grep glob **/*', grep({ glob: '**/*' }), 'block'],
        ...bashCases(
          [
            "rg -g '*' KEY",
            'rg --glob=* KEY',
            "rg --iglob '.E*' KEY",
            'rgrep KEY .',
            'fgrep -r KEY .',
            'rg --no-ignore-vcs KEY',
          ],
          'block',
          MAIN,
        ),
      ]),
    ).toEqual([]);
  });

  it('still allows narrow globs and exclusions', () => {
    expect(
      wrongCases([
        ['Grep glob *.ts', grep({ glob: '*.ts' }), 'allow'],
        ['Grep glob *.{ts,tsx}', grep({ glob: '*.{ts,tsx}' }), 'allow'],
        ['Grep glob !.env*', grep({ glob: '!.env*' }), 'allow'],
        ...bashCases(
          ["rg -g '*.ts' KEY", "rg -g '!*.md' KEY src", 'ls -la'],
          'allow',
          MAIN,
        ),
      ]),
    ).toEqual([]);
  });

  // L15 (run 3): searches that reach env files through paths, flag forms and globs.
  it('blocks the run 3 search and glob forms that reach env files', () => {
    expect(
      wrongCases(
        bashCases(
          [
            '/usr/bin/grep -r KEY .',
            'ggrep -r KEY .',
            'grep -d recurse KEY .',
            'grep --directories=recurse KEY .',
            "rg -g'*' KEY",
            "rg -ig '*' KEY",
            '/opt/homebrew/bin/rg -uu KEY',
            'cat .e*.s*',
            'cat .*.d*',
            'cat .*rc',
            "grep -r --exclude='.env*' KEY src ; grep -r KEY .",
            "grep -r --exclude='.env*' --include='*' KEY .",
          ],
          'block',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });

  // L16 (run 3): Claude Code splits a Grep glob on spaces and on commas outside braces.
  it('checks every part of a Grep glob list', () => {
    expect(
      wrongCases([
        ['glob *.ts,.env*', grep({ glob: '*.ts,.env*' }), 'block'],
        ['glob *.ts .env*', grep({ glob: '*.ts .env*' }), 'block'],
        ['glob *.{ts,md}', grep({ glob: '*.{ts,md}' }), 'allow'],
        ['glob {src,test}/*.ts', grep({ glob: '{src,test}/*.ts' }), 'allow'],
      ]),
    ).toEqual([]);
  });

  it('decodes URLs before the env check', () => {
    expect(
      wrongCases([
        [
          'navigate .%65nv',
          mcp('mcp__Claude_Browser__navigate', { url: 'file:///x/.%65nv' }),
          'block',
        ],
        [
          'navigate %2Eenv',
          mcp('mcp__Claude_Browser__navigate', { url: 'file:///x/%2Eenv' }),
          'block',
        ],
      ]),
    ).toEqual([]);
  });

  // Run 4 (MEDIUM): a plain env name in the Grep glob is only checked against ENV_SAMPLES.
  // An rg glob overrides .gitignore, and the settings deny list does not name these files.
  it('blocks a Grep glob that names any env file, not only the sample names', () => {
    expect(
      wrongCases([
        ['glob .env.prod', grep({ glob: '.env.prod' }), 'block'],
        ['glob .env.backup', grep({ glob: '.env.backup' }), 'block'],
        ['glob **/.ENV.DEV', grep({ glob: '**/.ENV.DEV' }), 'block'],
        ['glob .env.*.bak', grep({ glob: '.env.*.bak' }), 'block'],
        ['glob *.ts,.env.e2e', grep({ glob: '*.ts,.env.e2e' }), 'block'],
        ['glob .env.example', grep({ glob: '.env.example' }), 'allow'],
      ]),
    ).toEqual([]);
  });
});

describe('guard hook: hard rules for everyone (commit, push, merge, deploy)', () => {
  const forbidden = [
    'git commit -m x',
    'git -C . commit -m x',
    'git -c user.name=x commit -m x',
    'git --git-dir=.git commit -m x',
    'GIT_DIR=.git git commit -m x',
    'xargs git commit -m x',
    'git --no-pager push',
    'git push origin HEAD',
    'git merge main',
    'git rebase main',
    'git cherry-pick abc',
    'git revert abc',
    'git clean -fd',
    'git am x.patch',
    'git reset --hard',
    'git tag v1',
    'gh pr create --fill',
    'gh pr merge 1',
    'gh workflow run deploy-cloud-run.yml -f environment=production',
    'gh run rerun 1',
    'gh release create v1',
    'terraform apply',
    'terraform -chdir=infra/envs/prod apply',
    'terraform destroy',
    'terraform import a b',
    'terraform state rm x',
    'terraform taint x',
    'docker push x',
    'docker image push x',
    'docker buildx build --push .',
    'docker compose push',
    'gcloud run deploy api',
    'gcloud builds submit',
    'gcloud run services update api',
    'gcloud run services update-traffic api',
    'npm publish',
    'pnpm publish',
    'pnpm -r publish',
    'yarn publish',
    'sh -c "git push"',
    'grep -n KEY src/main.ts && terraform -chdir=infra apply',
  ];

  it('blocks them for the main agent and the tester', () => {
    expect(
      wrongCases([
        ...bashCases(forbidden, 'block', MAIN),
        ...bashCases(forbidden, 'block', TESTER),
      ]),
    ).toEqual([]);
  });

  it('allows read-only git, plans and the compare-branches commands', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'git status --porcelain',
            'git log --oneline -5',
            'git diff',
            'git fetch --all --prune',
            'git rev-parse HEAD',
            'git merge-base HEAD origin/main',
            'git diff --name-only $(git merge-base HEAD origin/main)',
            'git merge-tree --write-tree --name-only HEAD origin/main',
            "git for-each-ref --sort=-committerdate --format='%(refname:short)|%(authorname)' refs/remotes/origin",
            'git tag',
            // L17: listing tags is read-only.
            'git tag -l',
            'git tag --list',
            'git tag -n',
            "git tag -l 'v*'",
            'terraform init',
            'terraform plan',
            'gcloud run services describe api',
            'docker build -t api .',
            'docker compose up -d db',
          ],
          'allow',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });

  // L15 and L18 (run 3): other tools and forms of deploy, publish, tag and secret reads.
  it('blocks other deploy, publish, tag and secret commands', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'tofu apply',
            'terragrunt apply',
            'terragrunt run-all apply',
            'yarn npm publish',
            'git subtree push --prefix x origin y',
            'git tag -d v1',
            'git tag -a v1 -m x',
            'git tag --delete v1',
            'gcloud secrets versions access latest --secret=DATABASE_URL',
            'gcloud auth print-access-token',
            'gcloud auth application-default print-access-token',
            'terraform output -raw db_password',
            'terraform -chdir=infra/envs/prod output -json',
            'terraform show -json',
            'cat infra/envs/example/terraform.tfvars',
            'cat infra/envs/prod/vars.tfvars.json',
            'cat certs/server.pem',
            'cat certs/server.key',
          ],
          'block',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });

  it('still allows plans with a var file and the tfvars template', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'terraform plan -var-file=prod.tfvars',
            'cat infra/envs/example/terraform.tfvars.example',
          ],
          'allow',
          MAIN,
        ),
        [
          'Read the tfvars template',
          read('infra/envs/example/terraform.tfvars.example'),
          'allow',
        ],
      ]),
    ).toEqual([]);
  });

  it('blocks secret files in the file tools', () => {
    expect(
      wrongCases([
        ['Read tfvars', read('infra/envs/prod/terraform.tfvars'), 'block'],
        ['Read tfvars.json', read('infra/envs/prod/x.tfvars.json'), 'block'],
        ['Read a key', read('certs/server.key'), 'block'],
        ['Edit a pem', edit('certs/server.pem'), 'block'],
        ['tester Write a key', write('test/x.key', TESTER), 'block'],
      ]),
    ).toEqual([]);
  });

  // Run 4 (MEDIUM): bash runs `$(…)` and backticks inside double quotes too. The tokenizer keeps
  // quoted text as one word, so every rule is skipped for the common quoted form.
  it('sees commands inside quoted command substitutions', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'echo "$(git commit -m x)"',
            'X="$(git push)"',
            'echo "$(terraform apply -auto-approve)"',
            'OUT="$(pnpm test 2>&1)"',
            'echo "`pnpm test`"',
            'echo "Tests: $(pnpm test:e2e | tail -5)"',
          ],
          'block',
          MAIN,
        ),
        ...bashCases(['X="$(echo x > src/main.ts)"'], 'block', TESTER),
      ]),
    ).toEqual([]);
  });

  // Run 5 (M13 fix): substitutions also run in heredoc bodies, parameter defaults and nested quotes.
  it('sees commands in nested, multi-line and heredoc substitutions', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'X="$(\ngit push\n)"',
            'X="`git push`"',
            'echo "$(echo "$(git push)")"',
            'echo "${X:-$(git push)}"',
            'echo "$( (git push) )"',
            'cat <<EOF\n$(git push)\nEOF',
            'cat <<EOF\n`pnpm test`\nEOF',
            'cat <<-EOF\n\t$(pnpm test)\n\tEOF',
            'X=$(cat <<EOF\n$(git push)\nEOF\n)',
            'diff <(git push) x',
          ],
          'block',
          MAIN,
        ),
        [
          'MCP terminal X="$(pnpm test)"',
          {
            tool_name: 'mcp__terminal__run_in_terminal',
            tool_input: { command: 'X="$(pnpm test)"' },
          },
          'block',
        ],
      ]),
    ).toEqual([]);
  });

  it('keeps single quotes, escaped substitutions and quoted heredoc bodies as text', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            "echo '$(git push)'",
            "echo '`git push`'",
            'echo "\\$(git push)"',
            'echo \\`git push\\`',
            "cat <<'EOF'\n$(git push)\nEOF",
            'cat <<"EOF"\n`pnpm test`\nEOF',
            'echo "Today: $(date +%F)"',
            'git diff --name-only "$(git merge-base HEAD origin/main)"',
          ],
          'allow',
          MAIN,
        ),
        ...bashCases(
          ['OUT="$(pnpm test 2>&1)"; echo "$OUT" > /tmp/unit.log'],
          'allow',
          TESTER,
        ),
      ]),
    ).toEqual([]);
  });

  // Run 3 item (MEDIUM): `git pull` is a merge (or a rebase). Hard rule 1 says humans do it.
  it('blocks git pull, which merges or rebases', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'git pull',
            'git pull origin main',
            'git pull --rebase origin main',
            'git -C . pull',
          ],
          'block',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });
});

describe('guard hook: MCP tools and bad input', () => {
  const TERMINAL = 'mcp__terminal__run_in_terminal';
  const PREVIEW = 'mcp__Claude_Browser__preview_start';
  const NAVIGATE = 'mcp__Claude_Browser__navigate';

  it('checks MCP terminal commands, app previews and browser URLs', () => {
    expect(
      wrongCases([
        [
          'main terminal pnpm test',
          mcp(TERMINAL, { command: 'pnpm test' }),
          'block',
        ],
        [
          'main terminal cat env',
          mcp(TERMINAL, { command: 'cat .env' }),
          'block',
        ],
        [
          'main terminal git push',
          mcp(TERMINAL, { command: 'git push' }),
          'block',
        ],
        [
          'main terminal build',
          mcp(TERMINAL, { command: 'pnpm build' }),
          'allow',
        ],
        [
          'tester terminal pnpm test',
          mcp(TERMINAL, { command: 'pnpm test' }, TESTER),
          'allow',
        ],
        ['main preview start', mcp(PREVIEW, { name: 'api' }), 'block'],
        [
          'tester preview start',
          mcp(PREVIEW, { name: 'api' }, TESTER),
          'allow',
        ],
        [
          'navigate to a file env',
          mcp(NAVIGATE, { url: 'file:///x/.env' }),
          'block',
        ],
        [
          'navigate to localhost',
          mcp(NAVIGATE, { url: 'http://localhost:3000/health' }),
          'allow',
        ],
      ]),
    ).toEqual([]);
  });

  it('fails closed on input it cannot read', () => {
    expect(
      wrongCases([
        ['broken JSON', '{"tool_name": "Bash", "tool_input": {', 'block'],
        ['empty input', '', 'block'],
      ]),
    ).toEqual([]);
  });

  it('treats only a real tester subagent as the tester', () => {
    expect(
      wrongCases([
        [
          'agent_type tester without an agent id',
          {
            agent_type: 'tester',
            tool_name: 'Bash',
            tool_input: { command: 'pnpm test' },
          },
          'block',
        ],
        [
          'another subagent',
          {
            agent_id: 'agent-2',
            agent_type: 'general-purpose',
            tool_name: 'Bash',
            tool_input: { command: 'pnpm test' },
          },
          'block',
        ],
      ]),
    ).toEqual([]);
  });
});

describe('guard hook: tests and app starts belong to the tester', () => {
  // Correction item (HIGH): `const RUNNERS` is read before it is initialized, so every
  // main-agent Bash call that is not blocked earlier throws (exit 1 = not blocked).
  it('never crashes on a main-agent Bash call', () => {
    expect(
      wrongCases(
        bashCases(['git status', 'ls src', 'pnpm build'], 'allow', MAIN),
      ),
    ).toEqual([]);
  });

  it('blocks test runs and app starts for the main agent', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'pnpm test',
            'pnpm test:e2e',
            'pnpm run test:cov',
            'npm test',
            'npm t',
            'yarn test',
            'npx jest',
            'pnpm exec jest src',
            'pnpm jest',
            'node ./node_modules/jest/bin/jest.js',
            'node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json',
            'node --test',
            'cd src && pnpm test',
            'CI=1 pnpm test',
            'pnpm -r test',
            'pnpm --filter api test',
            'pnpm build && pnpm test',
            'pnpm start',
            'pnpm start:dev',
            'pnpm run start:prod',
            'npx nest start',
            'nest start --watch',
            'node dist/src/main.js',
          ],
          'block',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });

  // Run 2 fixes (L9): wrappers, subshells and launchers around a test run or an app start.
  it('sees test runs and app starts inside wrappers, subshells and launchers', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'sh -c "pnpm test"',
            "bash -lc 'cd src && pnpm test'",
            '/bin/zsh -c "pnpm test:e2e"',
            '(pnpm test)',
            'echo $(pnpm test)',
            'echo `pnpm test`',
            'time pnpm test',
            'env pnpm test',
            'env -i pnpm test',
            'nice pnpm test',
            'nohup pnpm test',
            'exec pnpm test',
            'command pnpm test',
            'xargs pnpm test',
            'npx -y jest',
            'npm exec jest',
            'npm exec -- jest',
            'pnpm dlx jest',
            'pnpm --dir . test',
            'pnpm -C . test',
            'bunx jest',
            'bun test',
            'yarn jest',
            'npx vitest',
            'node node_modules/.bin/jest',
            './node_modules/.bin/jest',
            'node ./dist/src/main',
            'node dist/main',
            'npx ts-node src/main.ts',
            'node -r ts-node/register src/main.ts',
          ],
          'block',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });

  // L15 (run 3): wrappers with value options, shell keywords, eval and other app starts.
  it('sees test runs and app starts behind the run 3 wrappers', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'timeout 120 pnpm test',
            'gtimeout 120 pnpm test',
            'timeout -s KILL 60 pnpm test',
            'timeout --signal=KILL 60 pnpm test',
            'timeout -k 5 60 pnpm test',
            'if pnpm test; then echo ok; fi',
            '{ pnpm test; }',
            '! pnpm test',
            'eval "pnpm test"',
            'nice -n 5 pnpm test',
            'env -u X pnpm test',
            'watch pnpm test',
            'caffeinate pnpm test',
            'stdbuf -oL pnpm test',
            'corepack pnpm test',
            'sudo -u root pnpm test',
            'xargs -n 1 pnpm test',
            'pnpm --reporter silent test',
            'npm --loglevel silent test',
            'docker run --rm boilerplate-check',
            'node .',
          ],
          'block',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });

  it('allows build, lint, format and install for the main agent', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'pnpm build',
            'pnpm lint:check',
            'pnpm format:check',
            'pnpm lint',
            'pnpm format',
            'pnpm install',
          ],
          'allow',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });

  it('lets the tester run tests and start the app', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'pnpm test',
            'pnpm test:e2e',
            'node --experimental-vm-modules ./node_modules/jest/bin/jest.js',
            'pnpm start:dev',
          ],
          'allow',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });
});

describe('guard hook: the tester writes only tests and task MDs', () => {
  it('allows specs, test/ files and MDs in tasks/', () => {
    expect(
      wrongCases([
        ['spec file', write('src/modules/x/y.spec.ts', TESTER), 'allow'],
        ['e2e spec', write('test/app.e2e-spec.ts', TESTER), 'allow'],
        ['test helper', write('test/helpers/db.ts', TESTER), 'allow'],
        ['test log MD', write('tasks/test-logs/x.md', TESTER), 'allow'],
        ['corrections MD', edit('tasks/corrections/x.md', TESTER), 'allow'],
        ['todo MD', write('tasks/todo/bug.md', TESTER), 'allow'],
        ['coder writes app code', write('src/main.ts'), 'allow'],
      ]),
    ).toEqual([]);
  });

  it('blocks app code, config and path tricks', () => {
    expect(
      wrongCases([
        ['app code', write('src/main.ts', TESTER), 'block'],
        [
          'service',
          edit('src/modules/platform/auth/auth.service.ts', TESTER),
          'block',
        ],
        ['package.json', write('package.json', TESTER), 'block'],
        ['the guard itself', write('.claude/hooks/guard.mjs', TESTER), 'block'],
        ['CLAUDE.md', edit('CLAUDE.md', TESTER), 'block'],
        ['non-MD in tasks', write('tasks/test-logs/x.json', TESTER), 'block'],
        [
          'traversal out of tasks',
          write('tasks/../src/main.md', TESTER),
          'block',
        ],
        [
          'traversal out of test',
          write('test/../src/app.module.ts', TESTER),
          'block',
        ],
      ]),
    ).toEqual([]);
  });

  // Correction item (MEDIUM): only Edit/Write are checked; Bash can still rewrite app code.
  it('blocks tester Bash commands that rewrite app code', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'pnpm lint',
            'pnpm lint --fix',
            'pnpm format',
            "sed -i '' 's/a/b/' src/main.ts",
            'perl -pi -e s/a/b/ src/main.ts',
            'oxlint --fix src',
            'oxfmt src',
            'oxfmt',
            './node_modules/.bin/oxfmt src',
            'echo x > src/main.ts',
            'echo x >> src/main.ts',
            'echo x >src/main.ts',
            'echo x &>src/main.ts',
            'cat > src/new.ts <<EOF',
            'cp /tmp/x src/main.ts',
            'mv src/a.ts src/b.ts',
            'rm src/main.ts',
            'tee src/main.ts',
            'touch src/new.ts',
            'install -m 644 /tmp/x src/x.ts',
            'pnpm add lodash',
            'pnpm remove x',
            'pnpm update',
          ],
          'block',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });

  it('lets the tester format its own files and write outside the project', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'oxfmt test/app.e2e-spec.ts src/main.spec.ts',
            'oxfmt --check src test',
            'pnpm format:check',
            'pnpm lint:check',
            'echo x > /tmp/run.log',
            'cp src/main.ts /tmp/',
            'sed -n 1,5p src/main.ts',
            'rm -rf dist coverage',
            'pnpm build',
            // L17: `$VAR` and `~` are expanded, so these logs are outside the project.
            'pnpm test > $TMPDIR/unit.log',
            'echo x > ~/x.log',
            'patch --dry-run -p1 < x.patch',
            'pnpm oxfmt src/x.spec.ts test/app.e2e-spec.ts',
            'pnpm oxfmt --check src',
          ],
          'allow',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });

  // L15 (run 3): a link from test/ into src/ must not open app code to the tester.
  it('follows symlinks, so a link in test/ does not open src/', () => {
    const name = `test/.guard-link-${process.pid}`;
    symlinkSync(join(ROOT, 'src'), join(ROOT, name), 'dir');
    try {
      expect(
        wrongCases([
          ['Write through the link', write(`${name}/main.ts`, TESTER), 'block'],
          [
            'Write a new file through the link',
            write(`${name}/new-file.ts`, TESTER),
            'block',
          ],
          [
            'Bash redirect through the link',
            bash(`echo x > ${name}/main.ts`, TESTER),
            'block',
          ],
          [
            'a spec through the link is still a spec',
            write(`${name}/x.spec.ts`, TESTER),
            'allow',
          ],
        ]),
      ).toEqual([]);
    } finally {
      unlinkSync(join(ROOT, name));
    }
  });

  // L15 (run 3): other ways to change files from Bash.
  it('blocks the run 3 tester writes to app code', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'echo x >| src/main.ts',
            'dd if=/tmp/x of=src/main.ts',
            'git apply x.patch',
            'patch -p1 < x.patch',
            'cp -t src /tmp/x.ts',
            'cp --target-directory=src /tmp/x.ts',
            'git checkout -- src/main.ts',
            'git restore src/main.ts',
            'git stash',
            'git reset HEAD~1',
          ],
          'block',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });

  // Run 3 item (MEDIUM): the fixers are only caught by their bare names. `npx`, `pnpm exec`,
  // `pnpm dlx` and `pnpm <bin>` run the same tools and rewrite app code.
  it('blocks the fixers when a launcher runs them', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'npx oxfmt src',
            'npx oxfmt',
            'pnpm exec oxfmt',
            'pnpm exec oxfmt .',
            'pnpm oxfmt src',
            'pnpm dlx oxfmt src',
            'pnpm exec oxlint --fix',
            'npx oxlint --fix src',
            'bunx oxfmt',
            'yarn oxfmt src',
            'npx -y oxfmt',
            'pnpm --silent exec oxfmt src',
          ],
          'block',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });
});

/** Like outcome(), with a time limit: a hook that hangs is a hook that lets the call through. */
function outcomeWithin(fixture: Fixture, timeoutMs: number): string {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify(fixture),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  if (result.error) return `no answer within ${timeoutMs} ms`;
  if (result.status === 2) return 'block';
  if (result.status === 0) return 'allow';
  const firstError =
    result.stderr.split('\n').find((line) => /Error/.test(line)) ?? '';
  return `exit ${result.status} ${firstError.trim()}`;
}

// Run 4 (MEDIUM): Claude Code lets a PreToolUse call through when the hook crashes (exit 1)
// or times out, unless the hook sets onFailure "block" (Claude Code 2.1.295 and later).
describe('guard hook: fails closed', () => {
  it('sets onFailure "block" on the guard hook', () => {
    const settings = JSON.parse(
      readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: { PreToolUse: { hooks: Record<string, unknown>[] }[] };
    };
    const guardHooks = settings.hooks.PreToolUse.flatMap(
      (entry) => entry.hooks,
    ).filter((hook) => String(hook.command).includes('guard.mjs'));

    expect(guardHooks.length).toBeGreaterThan(0);
    for (const hook of guardHooks) expect(hook.onFailure).toBe('block');
  });

  it('answers deeply nested commands with exit 0 or 2, never a crash', () => {
    const results = [
      `${'eval '.repeat(3000)}pnpm test`,
      `${'npx '.repeat(12000)}jest`,
    ].map((command) => outcomeWithin(bash(command), 20_000));

    for (const result of results) expect(result).toMatch(/^(block|allow)$/);
  });

  it('answers a glob with many stars within 2 seconds', () => {
    const glob = `.${'*'.repeat(24)}x`;
    expect(outcomeWithin(grep({ glob }), 2_000)).toMatch(/^(block|allow)$/);
    expect(outcomeWithin(bash(`cat ${glob}`), 2_000)).toMatch(
      /^(block|allow)$/,
    );
  });

  // Run 5 (M15 fix): a short timeout, so a slow guard blocks in seconds and not after 600 s.
  it('sets a short timeout on the guard hook', () => {
    const settings = JSON.parse(
      readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'),
    ) as { hooks: { PreToolUse: { hooks: Record<string, unknown>[] }[] } };
    const guardHooks = settings.hooks.PreToolUse.flatMap(
      (entry) => entry.hooks,
    ).filter((hook) => String(hook.command).includes('guard.mjs'));

    for (const hook of guardHooks) {
      expect(typeof hook.timeout).toBe('number');
      expect(hook.timeout).toBeGreaterThan(0);
      expect(hook.timeout).toBeLessThanOrEqual(60);
    }
  });

  it('blocks a command over 100,000 characters and answers a long harmless one fast', () => {
    expect(outcomeWithin(bash(`echo ${'a'.repeat(100_001)}`), 5_000)).toBe(
      'block',
    );
    expect(outcomeWithin(bash(`echo ${'a'.repeat(99_000)}`), 2_000)).toBe(
      'allow',
    );
    expect(outcomeWithin(bash(`${'nice '.repeat(19_000)}ls`), 2_000)).toBe(
      'allow',
    );
  });

  it('blocks substitutions nested too deep to check, also unclosed ones', () => {
    expect(
      outcomeWithin(
        bash(`${'echo $('.repeat(25)}git push${')'.repeat(25)}`),
        5_000,
      ),
    ).toBe('block');
    expect(outcomeWithin(bash(`${'$('.repeat(20_000)}ls`), 5_000)).toBe(
      'block',
    );
  });

  it('treats a glob with more than 8 stars or over 200 characters as unsafe', () => {
    expect(
      wrongCases([
        ['glob with 9 stars', grep({ glob: '.*a*a*a*a*a*a*a*a*x' }), 'block'],
        ['glob over 200 chars', grep({ glob: `.${'a'.repeat(200)}` }), 'block'],
        [
          'glob with 24 stars in a row',
          grep({ glob: `.${'*'.repeat(24)}x` }),
          'allow',
        ],
      ]),
    ).toEqual([]);
  });
});

// Run 5: the run 4 leftovers the coder closed (L28) and the false positives (L29).
describe('guard hook: run 4 leftovers and false positives', () => {
  it('blocks the L28 secret, deploy, GitHub and app-start forms', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'terraform output --raw db_password',
            'terraform output -raw=true db_password',
            'terraform show --json',
            'terraform show -json=true',
            'gcloud config config-helper --format=json',
            'gcloud secrets versions add DATABASE_URL --data-file=-',
            'docker container run --rm x',
            'npx @nestjs/cli start',
            'node node_modules/@nestjs/cli/bin/nest.js start',
            'pnpm exec nest start --watch',
            'grep --rec KEY .',
            'grep --directories=rec KEY .',
            'grep -d rec KEY .',
            'grep -drec KEY .',
            'gh api repos/o/r/pulls -f title=x -f head=b -f base=main',
            'gh api -X POST repos/o/r/actions/workflows/deploy-cloud-run.yml/dispatches -f ref=main',
            'gh api --method PUT repos/o/r/pulls/1/merge',
            'gh api -XPOST repos/o/r/merges',
            'gh api repos/o/r/git/refs --input ref.json',
            'terragrunt run --all apply',
            'terragrunt run -- apply',
            'cat ~/.ssh/id_ed25519',
            'cat ~/.ssh/id_rsa',
            'script -q /dev/null pnpm test',
            'cat .{e,x}nv',
            'cat .e{n,}v',
          ],
          'block',
          MAIN,
        ),
        ['Read an SSH key', read('../../.ssh/id_rsa'), 'block'],
        [
          'Grep path tfvars',
          grep({ path: abs('infra/envs/prod/terraform.tfvars') }),
          'block',
        ],
        [
          'Grep path SSH key',
          grep({ path: '/Users/x/.ssh/id_ed25519' }),
          'block',
        ],
      ]),
    ).toEqual([]);
  });

  it('still allows read-only gh api calls', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'gh api repos/o/r/pulls',
            "gh api -X GET repos/o/r/pulls --jq '.[].title'",
          ],
          'allow',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });

  it('blocks the L28 tester writes to app code', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'mv src/main.ts /tmp/x',
            'mv -t /tmp src/main.ts',
            'ln src/main.ts test/m.ts',
            'cp -rt src /tmp/x',
            'pnpm install -D lodash',
            'pnpm i lodash',
            'npm install lodash',
            'npm i -D lodash',
            'find src -name x.ts -delete',
            'find src -name x.ts -exec rm {} +',
            'curl -o src/main.ts http://x',
            'curl -O http://x/main.ts',
            'wget http://x/y.ts',
            'tar -xf x.tar -C src',
            'tar xf x.tar',
            'awk -i inplace 1 src/main.ts',
            'node node_modules/oxfmt/bin/oxfmt src',
            'node node_modules/.bin/oxfmt src',
            "cat > src/main.ts <<'EOF'\nx\nEOF",
            "cat <<'EOF' > src/main.ts\nx\nEOF",
          ],
          'block',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });

  it('lets the tester install from the lockfile and download outside the project', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'pnpm install',
            'wget -O /tmp/y http://x',
            'cp /tmp/x.ts test/x.e2e-spec.ts',
          ],
          'allow',
          TESTER,
        ),
      ),
    ).toEqual([]);
  });

  it('allows the L29 false positives', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'grep -n "it(.*" src/main.ts',
            'rg "\\(.*\\)" src',
            "rg -n 'job.key' src",
            'git tag --contains HEAD',
            'git tag --points-at HEAD',
            'git tag --merged main',
            'git tag --sort=-v:refname',
          ],
          'allow',
          MAIN,
        ),
        // `S=/tmp; echo x > $S/x.log` blocks again on purpose since run 7 (L40): see "run 7 checks".
        ...bashCases(
          [
            "cat > /tmp/x.js <<'EOF'\nconst f = (a) => a > 1;\nEOF",
            'cat > /tmp/x.js <<EOF\nconst f = (a) => a > 1;\nEOF',
          ],
          'allow',
          TESTER,
        ),
        ...bashCases(['git tag v2 HEAD'], 'block', MAIN),
      ]),
    ).toEqual([]);
  });
});

// Run 6: the run 5 leftovers the coder closed (L34 to L37).
describe('guard hook: run 5 leftovers (L34 to L37)', () => {
  it('blocks the L34 regressions of the L29 fixes', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            "cat x\\' .e* \\'",
            'echo \\" ; cat .e* ; echo "x"',
            "rg -g '*.tfvars' KEY",
            "rg --glob '*.pem' KEY",
            "rg -t ts -g '*.key' KEY",
            "rg -A 2 --iglob '*.PEM' KEY",
            "bash <<'EOF'\ngit push\nEOF",
            "sh -s <<'EOF'\npnpm test\nEOF",
            "cat <<'EOF' | bash\ngit push\nEOF",
          ],
          'block',
          MAIN,
        ),
        ...bashCases(
          [
            'F="$(pwd)/src/main.ts"; echo x > "$F"',
            'D=$(dirname src/main.ts); echo x > $D/main.ts',
            'S=src; echo x > $S/main.ts; S=/tmp',
            'S=src; S=/tmp true; echo x > $S/main.ts',
            'echo x > "$(pwd)/src/x.ts"',
          ],
          'block',
          TESTER,
        ),
      ]),
    ).toEqual([]);
  });

  it('keeps search patterns with .* or .key allowed', () => {
    expect(
      wrongCases(
        bashCases(
          [
            'grep -n "it(.*" src/main.ts',
            "rg -n 'job.key' src",
            "rg -t ts -C 2 'job.key' src",
          ],
          'allow',
          MAIN,
        ),
      ),
    ).toEqual([]);
  });

  it('blocks the L35 tokenizer, heredoc and brace leftovers', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'echo $(echo ")"; git push)',
            'echo "$(echo \'")\'; git push)"',
            'X=`echo \\`git push\\``',
            'cat <<E"OF"\nhello\nEOF\ngit push',
            'cat <<"EOF"x\nEOFx\ngit push',
            'cat <<E\\OF\nx\nEOF\ngit push',
            'cat {.,}env',
            'cat {x,.e}nv',
          ],
          'block',
          MAIN,
        ),
        ...[
          '*.prod',
          '.e[n]v.prod',
          '.e*.bak',
          '{.env.prod,x}',
          '*.{prod,ts}',
        ].map((glob): Case => [`Grep glob ${glob}`, grep({ glob }), 'block']),
        ...['*.ts', '*.{ts,md}'].map((glob): Case => [
          `Grep glob ${glob}`,
          grep({ glob }),
          'allow',
        ]),
      ]),
    ).toEqual([]);
  });

  it('checks Grep globs against the env file names in the top two folder levels', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-env-names-'));
    try {
      mkdirSync(join(dir, 'config'));
      // Empty stand-ins: the guard reads only the names.
      writeFileSync(join(dir, '.env.guardprobe'), '');
      writeFileSync(join(dir, 'config', '.env.deepprobe'), '');
      expect({
        root: outcome(grep({ glob: '*.guardprobe' }), dir),
        level2: outcome(grep({ glob: '*.deepprobe' }), dir),
        other: outcome(grep({ glob: '*.otherprobe' }), dir),
        realProject: outcome(grep({ glob: '*.guardprobe' })),
      }).toEqual({
        root: 'block',
        level2: 'block',
        other: 'allow',
        realProject: 'allow',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks the L36 secret, deploy and tester forms', () => {
    const home = homedir();
    expect(
      wrongCases([
        ...bashCases(
          [
            'terraform output -raw=1 db_password',
            'terraform output -raw=TRUE db_password',
            'cat ~/.ssh/id_*',
            'cat ~/.config/gcloud/application_default_credentials.json',
            'cat ~/.aws/credentials',
            'cat ~/.config/gh/hosts.yml',
            'gh auth token',
            'gh auth status --show-token',
            'gh auth status -t',
            'terragrunt apply-all',
            'terragrunt destroy-all',
            'script -q -c "pnpm test" /dev/null',
          ],
          'block',
          MAIN,
        ),
        ...bashCases(
          [
            'npm pkg set scripts.x=y',
            'npm pkg delete scripts.x',
            'cd test && echo x > ../src/main.ts',
          ],
          'block',
          TESTER,
        ),
        [
          'Read ~/.aws/credentials',
          {
            tool_name: 'Read',
            tool_input: { file_path: join(home, '.aws', 'credentials') },
          },
          'block',
        ],
        [
          'Read ~/.config/gh/hosts.yml',
          {
            tool_name: 'Read',
            tool_input: { file_path: join(home, '.config', 'gh', 'hosts.yml') },
          },
          'block',
        ],
        ['Grep path ~/.aws/', grep({ path: `${home}/.aws/` }), 'block'],
        ...bashCases(['gh auth status'], 'allow', MAIN),
        // Since run 7 (L39) a relative target is also checked from the project root, so these use absolute or tester paths.
        ...bashCases(
          [
            'npm pkg get name',
            'cd test && echo x > x.spec.ts',
            'cd /tmp && echo x > /tmp/y.log',
          ],
          'allow',
          TESTER,
        ),
      ]),
    ).toEqual([]);
  });

  it('counts ?, [ and { with stars, so a brace glob without stars answers fast (L37)', () => {
    const glob = `.${'{,?}'.repeat(34)}x`;
    expect(outcomeWithin(grep({ glob }), 2_000)).toBe('block');
    expect(outcomeWithin(bash(`cat ${glob}`), 2_000)).toBe('block');
  });
});

// Run 6 (MEDIUM): new findings. These fail until the guard is fixed.
describe('guard hook: run 6 findings', () => {
  // M16: a quote in a # comment opens a quote in the tokenizer, so every later line is hidden.
  it('ignores # comments, so a quote in a comment hides nothing', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            "# Don't run the tests here\npnpm test",
            "echo hi # it's fine\ngit push",
            "# it's only a look\ncat .e*",
            '# say "hi\ngit push',
            "for f in a b; do\n  # don't stop on errors\n  pnpm test $f\ndone",
          ],
          'block',
          MAIN,
        ),
        ...bashCases(["# let's fix it\necho x > src/main.ts"], 'block', TESTER),
        ...bashCases(
          ['echo a#b', "echo 'x' # git push", 'git log --format=#%h -1'],
          'allow',
          MAIN,
        ),
      ]),
    ).toEqual([]);
  });

  // M17: `npm version` and `pnpm version` make a git commit and a tag by default (hard rule 1).
  it('blocks version bumps that commit and tag', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'npm version patch',
            'npm version 1.2.3 --force',
            'pnpm version minor',
            'pnpm version patch --no-git-checks',
            'yarn version --patch',
          ],
          'block',
          MAIN,
        ),
        ...bashCases(['npm --version', 'pnpm --version'], 'allow', MAIN),
      ]),
    ).toEqual([]);
  });
});

// Run 7: proofs for fix round 5 (M16, M17, L39, L40, L44). They must keep passing.
describe('guard hook: run 7 checks (fix round 5)', () => {
  // M16: a comment runs to the end of its line, wherever that line is.
  it('reads # comments after operators and in substitutions, heredocs and loops', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            "echo a;# it's\ngit push",
            "echo a&&# it's\ngit push",
            "echo a|# it's\ngit push",
            "X=$(\n  # it's a list\n  git push\n)",
            'X="$(\n  # it\'s a list\n  git push\n)"',
            'X="$(# it\'s\ngit push)"',
            "echo $(echo a # it's\n) ; git push",
            "cat <<EOF # it's a note\nhello\nEOF\ngit push",
            "cat <<EOF\n# it's a body line\nEOF\ngit push",
            "bash <<'EOF'\n# it's a script\ngit push\nEOF",
            "true # it's\n# don't\n\ngit push",
            '#!/bin/bash\npnpm test',
            "pnpm build \\\n  # it's fine\npnpm test",
          ],
          'block',
          MAIN,
        ),
        ...bashCases(
          [
            "# it's a write\ncp /tmp/x src/main.ts",
            "echo x > src/main.ts # it's here",
          ],
          'block',
          TESTER,
        ),
        ...bashCases(
          [
            'echo $#',
            'echo ${#x}',
            'echo "#"; ls',
            'ls # pnpm test',
            '# git push',
            'echo x #; git push',
            'echo "a # it\'s"',
            '# it\'s "fine"\nls',
          ],
          'allow',
          MAIN,
        ),
      ]),
    ).toEqual([]);
  });

  // M17: every usual bump form makes a commit and a tag; read-only version calls stay allowed.
  it('blocks version bumps in their usual forms and keeps read-only version calls', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'yarn version',
            'yarn version --new-version 1.2.3',
            'npm --loglevel silent version patch',
            'pnpm -r version patch',
            'pnpm --filter x version patch',
            'npm version from-git',
            'npm version premajor --preid beta',
            'npm version patch -m "Release %s"',
            'corepack pnpm version patch',
            'sh -c "npm version patch"',
            'X=$(npm version patch)',
          ],
          'block',
          MAIN,
        ),
        ...bashCases(
          [
            'npm -v',
            'pnpm -v',
            'npm version',
            'pnpm version',
            'npm version --json',
            'npm version patch --no-git-tag-version',
            'pnpm version patch --no-git-tag-version',
            'yarn version --patch --no-git-tag-version',
            'npm view nestjs version',
            'pnpm view x version',
            'npm run version:check',
            'npm help version',
          ],
          'allow',
          MAIN,
        ),
      ]),
    ).toEqual([]);
  });

  // L39: a relative target is checked from the project root and from every cd target.
  it('checks a relative tester target from the root too, so a cd that did not move the shell opens nothing', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'cd /nonexistent-dir-x; echo x > src/main.ts',
            '(cd /tmp); echo x > src/main.ts',
            'cd /tmp | true; echo x > src/main.ts',
            "sh -c 'cd /tmp'; echo x > src/main.ts",
            'cd /tmp; cd -; echo x > src/main.ts',
            'pushd /tmp; popd; echo x > src/main.ts',
            'F=$(pwd)/src; cd /tmp; echo x > $F/main.ts',
            'cd /tmp; echo x > "$(echo $OLDPWD)/src/x.ts"',
            'cd src && echo x > main.ts',
            'cd src; cp /tmp/x main.ts',
            'cd src/modules && rm x.ts',
            'pushd src && touch y.ts',
            'cd test; cd ../src; echo x > main.ts',
            'cd src && cd .. && echo x > package.json',
            // Fail safe on purpose: from the root these name project files.
            'cd /tmp && echo x > y.log',
            'cd test && echo x > tmp.txt',
            'cd /tmp && tar -xf x.tar',
          ],
          'block',
          TESTER,
        ),
        ...bashCases(
          [
            'cd test && echo x > /tmp/y.log',
            'cd /tmp && tar -xf x.tar -C /tmp',
            'cd src && echo x > x.spec.ts',
          ],
          'allow',
          TESTER,
        ),
      ]),
    ).toEqual([]);
  });

  // L40: no variable tracking; any $NAME other than HOME and TMPDIR, or a substitution, counts as app code.
  it('treats every tester target with an unknown variable as app code', () => {
    expect(
      wrongCases([
        ...bashCases(
          [
            'S=(src); echo x > $S/main.ts',
            "S=/tmp; S=src sh -c 'echo x > $S/main.ts'",
            'S=/tmp; if true; then S=src; fi; echo x > $S/main.ts',
            'S=/tmp; read S <<< src; echo x > $S/main.ts',
            'S=/tmp; for S in src; do echo x > $S/main.ts; done',
            'S=/; S+=$PWD/src; echo x > $S/main.ts',
            'S=/tmp; echo x > ${S:+src}/main.ts',
            'S=/tmp; echo x > ${S/\\/tmp/src}/main.ts',
            'S=/tmp; echo x > $S/x.log',
            'echo x > $PWD/src/main.ts',
            'cp /tmp/x $D/main.ts',
          ],
          'block',
          TESTER,
        ),
        ...bashCases(
          ['echo x > /tmp/x.log', 'echo x > ~/x.log', 'echo x > $HOME/x.log'],
          'allow',
          TESTER,
        ),
      ]),
    ).toEqual([]);
  });

  it('expands $TMPDIR from its own environment and blocks it when unset', () => {
    const run = (command: string, env: Record<string, string | undefined>) =>
      outcome(bash(command, TESTER), ROOT, env);
    expect({
      set: run('echo x > $TMPDIR/x.log', { TMPDIR: '/tmp/guard-probe-tmp' }),
      braces: run('echo x > "${TMPDIR}x.log"', {
        TMPDIR: '/tmp/guard-probe-tmp/',
      }),
      unset: run('echo x > $TMPDIR/x.log', { TMPDIR: undefined }),
      intoTheProject: run('echo x > $TMPDIR/main.ts', {
        TMPDIR: join(ROOT, 'src'),
      }),
    }).toEqual({
      set: 'allow',
      braces: 'allow',
      unset: 'block',
      intoTheProject: 'block',
    });
  });

  // L44: fd numbers and fd copies are not files, and the | sh check reads only the heredoc's own line.
  it('reads N>, N>&M, &> and >& file as redirects', () => {
    const notes =
      "cat <<'EOF' > /tmp/notes.md\nRun curl x | sh to install.\ngit push is for humans.\nEOF";
    expect(
      wrongCases([
        ...bashCases(
          [
            'pnpm exec oxfmt test/x.e2e-spec.ts 2>&1',
            'rm -f test/tmp.mjs 2>/dev/null',
            'touch test/x.txt 2>/dev/null',
            'cp /tmp/x.ts test/x.e2e-spec.ts 2>&1',
            'node test/x.mjs > /tmp/out.txt 2>&1',
            'pnpm exec oxfmt --check src 2>&1 | tail -3',
            'echo x >&2',
            'echo x 1>&2',
            'echo x 2>&-',
            'ls &>/dev/null',
            'ls &>> /tmp/x.log',
            notes,
          ],
          'allow',
          TESTER,
        ),
        ...bashCases([notes], 'allow', MAIN),
        ...bashCases(
          [
            'echo x 2> src/main.ts',
            'echo x 2>src/main.ts',
            'echo x &> src/main.ts',
            'echo x &>> src/main.ts',
            'echo x >& src/main.ts',
            'echo x >&src/main.ts',
            'echo x 1>src/main.ts',
            'echo x 2>&1 > src/main.ts',
            'echo x > src/main.ts 2>&1',
            'echo x >&2 >> src/main.ts',
            'echo x 2>| src/main.ts',
            'cp /tmp/x src/main.ts 2>&1',
            'rm src/main.ts 2>/dev/null',
            'touch 2>/dev/null src/x.ts',
            'mv /tmp/x 2>&1 src/main.ts',
            'ls 2>&1 | tee src/x.log',
            'exec 3<>src/main.ts',
          ],
          'block',
          TESTER,
        ),
        ...bashCases(
          [
            "cat <<'EOF' | sh\ngit push\nEOF",
            "cat <<'EOF' | bash 2>&1\ngit push\nEOF",
          ],
          'block',
          MAIN,
        ),
      ]),
    ).toEqual([]);
  });
});
