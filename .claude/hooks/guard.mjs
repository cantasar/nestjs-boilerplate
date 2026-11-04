#!/usr/bin/env node
// PreToolUse guard for the team rules: env and secret files, commit/push/deploy, tests by the tester only, and tester writes.
// Exit code 2 blocks the call; it stops mistakes and is not a sandbox.
import { readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

const FILE_TOOLS = new Set([
  'Read',
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
]);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PACKAGE_MANAGERS = new Set(['pnpm', 'npm', 'yarn', 'bun']);
const LAUNCHERS = new Set(['npx', 'bunx', 'pnpx']);
const EXECUTORS = new Set([
  'node',
  'ts-node',
  'tsx',
  'nodemon',
  'deno',
  ...LAUNCHERS,
  ...PACKAGE_MANAGERS,
]);
const RUNNERS = new Set(['jest', 'vitest', 'mocha', 'ava']);
const FIXERS = new Set(['oxfmt', 'oxlint']);
const SHELLS = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'ksh',
  'mksh',
  'csh',
  'tcsh',
  'fish',
  'ash',
  'hush',
  'rbash',
  'yash',
  'ksh93',
  'pdksh',
  'oksh',
  'posh',
  'pwsh',
  'nu',
  'xonsh',
  'elvish',
]);
// `| sh` or `| sudo /bin/bash` on a heredoc's own line: that shell runs the heredoc body.
const PIPE_TO_SHELL = new RegExp(
  String.raw`\|\s*(sudo\s+)?(\S*/)?(${[...SHELLS].join('|')})(\s|$)`,
);
// A script operand that is really stdin or an fd: `bash -`, `source /dev/stdin`.
const STDIN_FILE = /^(-|\/dev\/(stdin|fd\/.*)|\/proc\/self\/fd\/.*)$/;
// Secret managers print or load secrets. Only these info calls may run.
const SECRET_MANAGERS = new Set([
  'doppler',
  'op',
  'dotenv',
  'dotenv-cli',
  'dotenvx',
  'infisical',
]);
// Global options with a value, so the value is not read as the subcommand: `gcloud --project p run`, `docker -H h ps`.
const GCLOUD_VALUE_FLAGS = new Set([
  '--project',
  '--account',
  '--configuration',
  '--region',
]);
const DOCKER_VALUE_FLAGS = new Set([
  '-H',
  '--host',
  '--context',
  '--config',
  '-c',
]);
const INFO_ARGS = new Set(['--version', '-v', '--help', '-h', 'help']);
const GREPS = new Set(['grep', 'egrep', 'fgrep', 'ggrep', 'rgrep']);
const REDIRECTS = new Set(['>', '>>', '>|']);
const REDIRECT_TOKENS = new Set([...REDIRECTS, '<', '<<', '<<<']);
// Words that only wrap the real command, with their options that take a value.
const WRAPPERS = new Map([
  ['time', ['-f', '-o']],
  [
    'env',
    ['-u', '-C', '-P', '-L', '-U', '-a', '--unset', '--chdir', '--argv0'],
  ],
  ['nice', ['-n', '--adjustment']],
  ['nohup', []],
  ['exec', ['-a']],
  ['command', []],
  ['builtin', []],
  ['busybox', []],
  // zsh precommand modifiers. `-` runs the command as a login command.
  ['noglob', []],
  ['nocorrect', []],
  ['-', []],
  ['coproc', []],
  ['corepack', []],
  ['sudo', ['-u', '-g', '-C', '-D', '-h', '-p', '-U']],
  ['xargs', ['-n', '-I', '-L', '-P', '-d', '-E', '-s', '-a']],
  ['timeout', ['-s', '-k', '--signal', '--kill-after']],
  ['gtimeout', ['-s', '-k', '--signal', '--kill-after']],
  ['stdbuf', ['-i', '-o', '-e']],
  ['caffeinate', ['-t', '-w']],
  ['script', ['-t']],
]);
// Wrappers with plain words before the command: the duration in `timeout 10 x`, the file in `script -q log x`.
const WRAPPER_ARGS = new Map([
  ['timeout', 1],
  ['gtimeout', 1],
  ['script', 1],
]);
// `watch` runs its words with `sh -c`.
const WATCH_VALUE_FLAGS = new Set(['-n', '--interval']);
// Tools the guard checks by subcommand (plus Terraform and deploy tools), so a dynamic subcommand could hide `push` or `test`.
const GUARDED_TOOLS = new Set([
  'git',
  'gh',
  'gcloud',
  'docker',
  'docker-compose',
  'aws',
  'aws-vault',
  ...PACKAGE_MANAGERS,
  ...LAUNCHERS,
]);
// Words after which `(` is shell syntax, not a zsh glob group: `case x in(a)`, `if (x)`, `time (x)`.
const GROUP_KEYWORDS = new Set([
  'if',
  'then',
  'else',
  'elif',
  'do',
  'while',
  'until',
  '!',
  '{',
  'in',
  'time',
]);
// Shell words in front of a command, like `if pnpm test; then`, `! pnpm test` or `{ pnpm test; }`.
const SHELL_KEYWORDS = new Set([
  'if',
  'then',
  'else',
  'elif',
  'do',
  'while',
  'until',
  '!',
  '{',
]);
const PM_VALUE_FLAGS = new Set([
  '--filter',
  '-F',
  '--dir',
  '-C',
  '--prefix',
  '--cwd',
  '--workspace',
  '--reporter',
  '--loglevel',
]);
// grep and rg options whose value is the next word, so that word is not the search pattern.
const SEARCH_VALUE_FLAGS = new Set([
  '-g',
  '--glob',
  '--iglob',
  '-t',
  '--type',
  '-T',
  '--type-not',
  '-A',
  '-B',
  '-C',
  '-m',
  '--max-count',
  '-j',
  '--threads',
  '-M',
  '--max-columns',
  '--include',
  '--exclude',
  '--exclude-dir',
]);
const GIT_VALUE_FLAGS = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
]);
const GIT_BLOCKED = new Set([
  'commit',
  'push',
  'pull',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'clean',
  'am',
  'subtree',
]);
// Git subcommands that change files in the working tree (blocked for the tester).
const GIT_FILE_WRITES = new Set([
  'apply',
  'checkout',
  'restore',
  'stash',
  'reset',
  'mv',
  'rm',
]);
const TERRAFORMS = new Set(['terraform', 'tofu', 'terragrunt']);
const TERRAFORM_BLOCKED = new Set([
  'apply',
  'destroy',
  'import',
  'state',
  'taint',
  'untaint',
  'force-unlock',
  'apply-all',
  'destroy-all',
]);
const GCLOUD_WRITES = new Set([
  'deploy',
  'submit',
  'create',
  'add',
  'update',
  'update-traffic',
  'replace',
  'delete',
  'execute',
]);
// AWS CLI options that take a value, so the value is not read as the service or operation.
const AWS_VALUE_FLAGS = new Set([
  '--profile',
  '--region',
  '--output',
  '--query',
  '--endpoint-url',
  '--color',
  '--ca-bundle',
  '--cli-read-timeout',
  '--cli-connect-timeout',
  '--cli-binary-format',
]);
// Read-only AWS CLI operations. Every other operation counts as a cloud change (fail closed).
const AWS_READ = /^(describe|list|get)-/;
const AWS_READ_OPS = new Set([
  'wait',
  'help',
  'list',
  'ls',
  'tail',
  'filter-log-events',
]);
// AWS CLI operations that print secrets, plaintext or credentials.
const AWS_SECRET_READS = new Set([
  'get-secret-value',
  'batch-get-secret-value',
  'get-login-password',
  'get-authorization-token',
  'get-session-token',
  'get-federation-token',
  'assume-role',
  'assume-role-with-web-identity',
  'assume-role-with-saml',
  'export-credentials',
  'get-parameter',
  'get-parameters',
  'get-parameters-by-path',
  'get-parameter-history',
  'decrypt',
  'get-role-credentials',
  'generate-db-auth-token',
  'get-token',
  'get-password-data',
  'get-cluster-credentials',
  'get-cluster-credentials-with-iam',
  'get-credentials-for-identity',
  'get-open-id-token',
  'get-open-id-token-for-developer-identity',
]);
// Deploy CLIs other than Terraform. Only their read commands may run.
const DEPLOY_TOOLS = new Set([
  'cdk',
  'aws-cdk',
  'sam',
  'copilot',
  'eb',
  'serverless',
  'sls',
]);
const DEPLOY_TOOL_READS = new Set([
  'synth',
  'synthesize',
  'diff',
  'ls',
  'list',
  'doctor',
  'docs',
  'notices',
  'validate',
  'build',
  'logs',
  'status',
  'events',
  'health',
  'help',
  'version',
]);
// `aws-vault exec` options that take a value, before the profile name.
const AWS_VAULT_VALUE_FLAGS = new Set([
  '-d',
  '--duration',
  '-t',
  '--mfa-token',
  '--region',
  '--prompt',
]);
// `aws-vault` global options that take a value, before the subcommand.
const AWS_VAULT_GLOBAL_VALUE_FLAGS = new Set([
  '--backend',
  '--prompt',
  '--keychain',
  '--secret-service-collection',
  '--pass-dir',
  '--pass-cmd',
  '--pass-prefix',
  '--file-dir',
]);
// Script runners and CLI path forms for a nested Claude Code run.
const SCRIPT_RUNNERS = new Set(['node', 'bun', 'deno', 'tsx', 'ts-node']);
const CLAUDE_CLI_PATH =
  /@anthropic-ai\/claude-code(\/|$)|claude-code\/cli\.m?js$/;
const CLAUDE_INFO_FLAGS = new Set(['--version', '-v', '--help', '-h']);
// Launcher options that run a shell string (`npx -c "cmd"`), and options that take a value.
const LAUNCHER_CALL_FLAGS = new Set(['-c', '--call', '--shell-mode']);
const LAUNCHER_VALUE_FLAGS = new Set(['-p', '--package']);
const MAX_NESTING = 20;
const MAX_COMMAND_LENGTH = 100_000;
// Marks the place of a `$(...)` in a word: its output is unknown, so a path with it counts as app code.
const SUBSTITUTION = '\u0000';

// Every `.env*` name except `.env.example`, like .gitignore. Any letter case, because macOS disks ignore case.
const ENV_NAME = /^\.env(?!\.example$)/i;
const ENV_IN_TEXT = /(^|[^\w.-])\.env(?!\.example(?![\w.-]))/i;
const ENV_SAMPLES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.staging',
  '.env.test',
  '.envrc',
  '.env.dev',
  '.env.prod',
  '.env.qa',
  '.env.ci',
  '.env.e2e',
  '.env.docker',
  '.env.bak',
  '.env.backup',
  '.env.old',
];
// Terraform variable files, private keys and SSH keys, plus folders that hold cloud and GitHub credentials.
const SECRET_FILE =
  /(\.(tfvars|tfvars\.json|pem|key)|(^|\/)id_(rsa|dsa|ecdsa|ed25519)\S*)$/i;
// The folder itself counts too (`cp -r ~/.aws x`, `-v ~/.aws:/root/.aws`), so its files cannot be copied out.
const SECRET_PATH =
  /(^|\/)\.(aws|ssh)(\/|:|$)|(^|\/)\.config\/(gcloud|gh)(\/|:|$)/i;

const NO_ENV =
  'Env files are off-limits. Only .env.example may be read or edited.';
const NO_SECRETS =
  'Secrets are off-limits: tfvars, private keys, cloud credentials and access tokens.';
const NO_COMMIT =
  'Never commit, push, pull, merge or open PRs. The user does it.';
const NO_GITHUB_WRITE =
  'GitHub writes (PRs, workflow runs, releases) are for the user.';
const NO_DEPLOY =
  'Never deploy or publish. People deploy with Terraform and the deploy workflow.';
const NO_AWS_WRITE =
  'Only read-only AWS CLI calls (describe-*, list-*, get-*, wait) are allowed. Cloud changes are for people.';
const NO_TESTS =
  'Only the tester session runs tests. End your turn with a tester prompt.';
const NO_APP_START =
  'Starting the app is a smoke test. Leave it to the tester session, or the user can run it.';
const NO_TESTER_SUBAGENT =
  'The tester runs in its own session. End your turn with a tester prompt.';
const NO_NESTED_CLAUDE =
  'Do not start another Claude session from here. The user runs the coder and tester sessions.';
const NO_DYNAMIC_COMMAND =
  'The command name or subcommand is a variable, $(...) or a glob, so it cannot be checked. Write it out.';
const NO_PIPED_SHELL =
  'A shell that reads code from a pipe, stdin, xargs or <(...) cannot be checked. Run the commands directly.';
const NO_SECRET_MANAGER =
  'Secret managers (doppler, op, infisical, dotenv) print or load secrets. The user runs them.';
const NO_UNCHECKABLE =
  'This shell feature cannot be checked: CDPATH, PS4 with $(...), or a zsh glob qualifier that runs code. Write the command out plainly.';
const NO_HEREDOC_DELIMITER =
  'This heredoc delimiter cannot be checked. Use a plain word like EOF.';
const NO_DATA_DELETE =
  'Never delete Docker volumes or data. The user can do it.';
const TESTER_SCOPE =
  'The tester may only write *.spec.ts, files in test/ and MDs in tasks/, also through Bash (temp files: use an absolute path like /tmp/x). Put app-code fixes in tasks/corrections/.';

// Folders that `cd` or `pushd` moved to earlier in the command line. Tester paths are checked from each of them.
const cdTargets = [];
// Words with an unquoted glob or brace list, like `gi?` or `{git,push}`. The shell expands them, so they are not literal names.
const globbedWords = new Set();
// Caches, so long commands stay fast. Above the limits the guard fails closed.
const realPaths = new Map();
const secretPaths = new Map();
const MAX_CD_TARGETS = 50;
const MAX_PATH_CHECKS = 20_000;
let pathChecks = 0;
// Shell option readings can grow fast (`bash -c -o bash -c -o ...`), so one tool call gets a fixed budget.
const MAX_SHELL_STRINGS = 200;
const MAX_SHELL_CHARS = 1_000_000;
let shellStrings = 0;
let shellChars = 0;
let envNames;

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  block('The tool call could not be read, so it is blocked to be safe.');
}

const tool = String(input?.tool_name ?? '');
const args = input?.tool_input ?? {};
// The tester subagent or a session started with `claude --agent tester`. Claude Code sets agent_type, not the model.
const isTester = input?.agent_type === 'tester';
const projectDir = realPathOf(
  resolve(process.env.CLAUDE_PROJECT_DIR ?? input?.cwd ?? process.cwd()),
);
// The Bash tool keeps the folder of an earlier `cd` and sends it as `cwd`.
const startDir = input?.cwd
  ? realPathOf(resolve(String(input.cwd)))
  : projectDir;

if (FILE_TOOLS.has(tool)) {
  const filePath = String(args.file_path ?? args.notebook_path ?? '');
  if (ENV_NAME.test(basename(filePath))) block(NO_ENV);
  if (SECRET_FILE.test(filePath) || isSecretPath(filePath)) block(NO_SECRETS);
  if (
    isTester &&
    WRITE_TOOLS.has(tool) &&
    !isTesterFile(filePath) &&
    !isTempPath(filePath)
  )
    block(TESTER_SCOPE);
}
if (
  ['Agent', 'Task'].includes(tool) &&
  String(args.subagent_type ?? '')
    .trim()
    .toLowerCase() === 'tester'
)
  block(NO_TESTER_SUBAGENT);
if (tool === 'Grep') {
  const path = String(args.path ?? '');
  if (
    ENV_IN_TEXT.test(path) ||
    splitGlobs(String(args.glob ?? '')).some(globMatchesEnv)
  ) {
    block(
      'This search can reach env files. Narrow the path or the glob (for example *.ts).',
    );
  }
  if (SECRET_FILE.test(path) || (path && isSecretPath(path))) block(NO_SECRETS);
}
if (tool === 'Bash' || /^mcp__.+__run_in_terminal$/.test(tool)) {
  checkCommand(String(args.command ?? ''));
}
if (/^mcp__.+__(preview_start|navigate)$/.test(tool)) {
  if (ENV_IN_TEXT.test(decodeUrl(String(args.url ?? '')))) block(NO_ENV);
  if (args.name && !isTester) block(NO_APP_START);
}
process.exit(0);

function block(message) {
  process.stderr.write(`Blocked by .claude/hooks/guard.mjs: ${message}\n`);
  process.exit(2);
}

function checkCommand(command) {
  if (command.length > MAX_COMMAND_LENGTH) {
    block(
      'This command is too long to check. Write long text with the Write tool.',
    );
  }
  // Without quotes and backslashes, tricks like `.e""nv` read as `.env`.
  const plain = command.replace(/["'\\]/g, '');
  // `--exclude=.env*` keeps env files out of a search, so it is not a mention.
  if (ENV_IN_TEXT.test(plain.replace(/--exclude=\.env\*(?=\s|$)/gi, ''))) {
    block(
      `${NO_ENV} If it is only text for a file, write the file with the Write tool.`,
    );
  }
  // `PS4='$(cmd)'` runs code on each traced line, and setting CDPATH moves `cd` to a folder the guard cannot see.
  // Only `NAME=` counts, so text that just mentions the names passes. Text with `CDPATH=` is blocked too (fail closed).
  if (
    (/\bPS4\+?=/.test(plain) && /\$\(|`/.test(command)) ||
    /\bCDPATH\+?=/.test(plain)
  )
    block(NO_UNCHECKABLE);
  const globWords = [];
  const commands = splitCommand(command, 0, globWords);
  if (dotGlobs(globWords).some(globMatchesEnv)) block(NO_ENV);
  // Decoded `$'\x2eenv'` only shows up in the parsed words.
  if (
    commands.some((words) =>
      words.some((word) =>
        ENV_IN_TEXT.test(word.replace(/^--exclude=\.env\*$/i, '')),
      ),
    )
  )
    block(NO_ENV);
  const secret = (word) =>
    (SECRET_FILE.test(word) || SECRET_PATH.test(word)) &&
    !word.startsWith('-var-file=');
  if (
    commands.some((words) => fileWords(words).some(secret)) ||
    globWords.some(secretGlob)
  )
    block(NO_SECRETS);
  for (const words of commands) {
    if (['cd', 'pushd'].includes(commandName(words[0]))) {
      // A `cd` can fail or be skipped, so a relative one is resolved from every earlier folder.
      const target = expandPath(skipOptions(words.slice(1))[0] ?? homedir());
      for (const base of bases()) {
        const dir = resolve(base, target);
        if (!cdTargets.includes(dir)) cdTargets.push(dir);
      }
      if (cdTargets.length > MAX_CD_TARGETS)
        block('This command changes folders too often to check.');
      continue;
    }
    // A folder named from its parent: `cd ~/.config && cp -r gcloud x`, `tar -C ~/.config gcloud`.
    const all = bases();
    const dirs = new Set([
      ...all,
      ...words
        .map((word, i) =>
          ['-C', '--directory'].includes(words[i - 1])
            ? word
            : /^--directory=(.*)$/.exec(word)?.[1],
        )
        .filter(Boolean)
        .flatMap((dir) => all.map((base) => resolve(base, expandPath(dir)))),
    ]);
    for (const word of fileWords(words).slice(1)) {
      if (word.startsWith('-') && !word.includes('=')) continue;
      const glob = globbedWords.has(word);
      // `curl -d @dir/x` and `dd if=dir/x` name a file after `@` or `=`.
      const paths = new Set([
        word,
        word.replace(/^@/, ''),
        word.slice(word.indexOf('=') + 1),
      ]);
      for (const path of paths) {
        for (const dir of dirs) {
          pathChecks += 1;
          if (pathChecks > MAX_PATH_CHECKS)
            block('This command names too many paths to check.');
          if (
            isSecretPath(
              resolve(dir, expandPath(path)),
              glob || /[*?[{(]/.test(dir),
            )
          )
            block(NO_SECRETS);
        }
      }
    }
    if (searchesIgnoredFiles(words)) {
      block(
        "This search can read ignored files like .env. Use the Grep tool, `git grep`, or grep with --exclude='.env*'.",
      );
    }
    const rule = commandRule(words);
    if (rule) block(rule);
    if (!isTester && isTestRun(words)) block(NO_TESTS);
    if (!isTester && isAppStart(words)) block(NO_APP_START);
    if (isTester && changesAppCode(words)) block(TESTER_SCOPE);
  }
}

/**
 * A credential path: `SECRET_PATH`, a whole `.config` folder, or a path whose symlinks lead to one.
 * Only a word the shell globs (`glob`) is also read as a glob.
 */
function isSecretPath(path, glob = false) {
  const key = `${glob ? 1 : 0}${path}`;
  if (!secretPaths.has(key)) {
    const full = expandPath(path);
    secretPaths.set(
      key,
      [full, realPathOf(resolve(projectDir, full))].some(
        (candidate) =>
          SECRET_PATH.test(candidate) ||
          /(^|\/)\.config\/?$/i.test(candidate) ||
          (glob && secretGlob(candidate)),
      ),
    );
  }
  return secretPaths.get(key);
}

/** Folders a relative path can start from: the project, the tool call's `cwd` and every `cd` target. */
function bases() {
  return [...new Set([projectDir, startDir, ...cdTargets])];
}

/** Words that can name files. A grep, rg or `git grep` pattern is text, not a file. */
function fileWords(words) {
  const name = commandName(words[0]);
  const gitGrep = name === 'git' ? words.indexOf('grep') : -1;
  if (
    (!GREPS.has(name) && name !== 'rg' && gitGrep < 0) ||
    words.some((word) => /^(-e|-f|--regexp|--file)/.test(word))
  )
    return words;
  let pattern = gitGrep < 0 ? 1 : gitGrep + 1;
  while (pattern < words.length && words[pattern].startsWith('-')) {
    pattern += SEARCH_VALUE_FLAGS.has(words[pattern]) ? 2 : 1;
  }
  return words.filter((_, i) => i !== pattern);
}

/** grep -r, rg -u and rg globs can read ignored files like .env. */
function searchesIgnoredFiles(words) {
  const name = commandName(words[0]);
  if (GREPS.has(name)) {
    const recursive =
      name === 'rgrep' ||
      words.some(
        (word, i) =>
          /^-[a-zA-Z]*[rR]|^--(dereference-)?rec|^--di[a-z]*=rec|^-drec/.test(
            word,
          ) ||
          (['-d', '--directories'].includes(word) &&
            words[i + 1]?.startsWith('rec')),
      );
    // grep lets a later --include win over --exclude.
    const includesEnv = words.some(
      (word) => word.startsWith('--include=') && globMatchesEnv(word.slice(10)),
    );
    return recursive && (!words.includes('--exclude=.env*') || includesEnv);
  }
  if (name === 'rg') {
    return words.some(
      (word, i) =>
        /^--no-ignore|^--unrestricted$|^-[a-zA-Z]*u/.test(word) ||
        globMatchesEnv(rgGlob(word, words[i + 1]) ?? ''),
    );
  }
  if (name === 'git') {
    const [sub, ...rest] = skipOptions(words.slice(1), GIT_VALUE_FLAGS);
    return (
      sub === 'grep' &&
      rest.some((word) => word === '--untracked' || word === '--no-index')
    );
  }
  return false;
}

/** The glob an rg option sets: `-g x`, `-gx`, `-ig x`, `--glob=x` or `--iglob x`. An rg glob overrides .gitignore. */
function rgGlob(word, next) {
  const long = /^--i?glob(?:=(.*))?$/.exec(word);
  if (long) return long[1] ?? next;
  const short = /^-[a-zA-Z]*g(.*)$/.exec(word);
  return short ? short[1] || next : undefined;
}

/** A glob word that can expand to a credential folder: `~/.aw?/x`, `~/.ss[h]`, `~/.config/gclou?`. */
function secretGlob(glob) {
  if (!hasGlob(glob)) return false;
  const parts = expandPath(glob).split('/');
  // A plain `*` skips dotfiles, so only a part that starts like a dotfile can reach `.aws` or `.config`.
  const dotPart = (part, names) =>
    /^[.[{(]/.test(part) && partMatches(part, names);
  return parts.some(
    (part, i) =>
      dotPart(
        part,
        i === parts.length - 1 ? ['.aws', '.ssh', '.config'] : ['.aws', '.ssh'],
      ) ||
      (dotPart(parts[i - 1] ?? '', ['.config']) &&
        partMatches(part, ['gcloud', 'gh'])),
  );
}

/** True when one path part (a glob or a plain name) matches one of the names, ignoring case. */
function partMatches(part, names) {
  if (!part) return false;
  if (part.length > 200 || (part.match(/[*?[{]/g) ?? []).length > 8)
    return true;
  try {
    const pattern = globToRegExp(part);
    return names.some((name) => pattern.test(name));
  } catch {
    return true;
  }
}

/** Shell words with unquoted glob characters (`.*`, `.en?`, `{.,}env`) that can expand to a dotfile. */
function dotGlobs(globWords) {
  return globWords
    .map((glob) => glob.split('/').pop() ?? '')
    .filter(
      (name) =>
        name !== '{' &&
        /(^|[^\\])[*?[{(]/.test(name) &&
        (/^[.(]/.test(name) || /(^|[^\\])\{/.test(name)),
    );
}

/** Claude Code splits a Grep glob on spaces and on commas outside braces, so each part is checked. */
function splitGlobs(glob) {
  const parts = [''];
  let braces = 0;
  for (const char of glob) {
    if (char === '{') braces += 1;
    if (char === '}') braces = Math.max(0, braces - 1);
    if (/\s/.test(char) || (char === ',' && braces === 0)) parts.push('');
    else parts[parts.length - 1] += char;
  }
  return parts.filter(Boolean);
}

/** True when a glob (shell, rg -g or the Grep tool) can match an env file name. `!` globs only exclude. */
function globMatchesEnv(glob) {
  const trimmed = glob.trim();
  const name = (trimmed.split('/').pop() ?? '').replace(/\*+/g, '*');
  if (!name || trimmed.startsWith('!')) return false;
  if (ENV_NAME.test(name)) return true;
  // Long globs or many wildcards make the regex slow, so they count as unsafe.
  if (name.length > 200 || (name.match(/[*?[{]/g) ?? []).length > 8)
    return true;
  try {
    const pattern = globToRegExp(name);
    return envSamples().some((sample) => pattern.test(sample));
  } catch {
    return true; // A glob we cannot read counts as unsafe.
  }
}

/** ENV_SAMPLES plus the env file names in the top two folder levels of the project. Names only, never content. */
function envSamples() {
  if (envNames) return envNames;
  const names = new Set(ENV_SAMPLES);
  const folders = [projectDir];
  for (const entry of listFolder(projectDir)) {
    if (
      entry.isDirectory() &&
      !['node_modules', '.git', 'dist'].includes(entry.name)
    ) {
      folders.push(join(projectDir, entry.name));
    }
  }
  for (const folder of folders) {
    for (const entry of listFolder(folder))
      if (ENV_NAME.test(entry.name)) names.add(entry.name);
  }
  envNames = [...names];
  return envNames;
}

function listFolder(folder) {
  try {
    return readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
}

function globToRegExp(glob) {
  const literal = (char) => char.replace(/[.+^$()|\\[\]{}*?]/g, '\\$&');
  let source = '';
  let braces = 0;
  // zsh glob groups: `.e(n|x)v`.
  let groups = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '(') {
      groups += 1;
      source += '(?:';
    } else if (char === ')' && groups > 0) {
      groups -= 1;
      source += ')';
    } else if (char === '|' && groups > 0) source += '|';
    else if (char === '\\') {
      source += literal(glob[i + 1] ?? '');
      i += 1;
    } else if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else if (char === '[' && glob.indexOf(']', i + 2) > i) {
      const end = glob.indexOf(']', i + 2);
      source += `[${glob
        .slice(i + 1, end)
        .replace(/^!/, '^')
        .replace(/\\/g, '\\\\')}]`;
      i = end;
    } else if (char === '{') {
      braces += 1;
      source += '(?:';
    } else if (char === '}' && braces > 0) {
      braces -= 1;
      source += ')';
    } else if (char === ',' && braces > 0) source += '|';
    else source += literal(char);
  }
  return new RegExp(`^${source}$`, 'i');
}

function decodeUrl(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

/** Simple commands as word lists. Wrappers, `sh -c "..."`, `eval` and `$(...)` are opened up. */
function splitCommand(line, depth, globWords) {
  if (depth > MAX_NESTING) block('This command nests too deep to check.');
  const nested = [];
  const commands = parseCommands(line, nested, globWords).flatMap((words) =>
    openCommand(words, depth, globWords),
  );
  const inner = nested.flatMap((text) =>
    splitCommand(text, depth + 1, globWords),
  );
  return [...commands, ...inner].filter((words) => words.length > 0);
}

/** One simple command, with its wrappers, shell strings and `find -exec` commands opened up. */
function openCommand(words, depth, globWords) {
  if (depth > MAX_NESTING) block('This command nests too deep to check.');
  // Linux `script -c "cmd" file` runs a command string.
  if (commandName(words[0]) === 'script' && words.includes('-c')) {
    return splitCommand(
      words[words.indexOf('-c') + 1] ?? '',
      depth + 1,
      globWords,
    );
  }
  const real = unwrap(words);
  if (readsCodeFromStdin(words, real)) block(NO_PIPED_SHELL);
  // `find -exec git push \;` runs a command of its own.
  if (commandName(real[0]) === 'find') {
    return [
      real,
      ...findExecs(real).flatMap((exec) =>
        openCommand(exec, depth + 1, globWords),
      ),
    ];
  }
  // A shell string also runs behind a launcher: `npx sh -c "cmd"`, `pnpm exec npx -c "cmd"`.
  for (let inner = real, n = 0; inner && n <= MAX_NESTING; n += 1) {
    const texts = shellString(inner);
    if (texts !== null)
      return texts.flatMap((text) => splitCommand(text, depth + 1, globWords));
    const next = launched(inner) ?? pnpmFallback(inner);
    inner = next?.length ? unwrap(next) : null;
  }
  return [real];
}

/** The commands after each `-exec`, `-execdir`, `-ok` or `-okdir` of a `find`, up to `;` or `+`. */
function findExecs(words) {
  const execs = [];
  words.forEach((word, i) => {
    if (!['-exec', '-execdir', '-ok', '-okdir'].includes(word)) return;
    const rest = words.slice(i + 1);
    const end = rest.findIndex((next) => next === ';' || next === '+');
    execs.push(end < 0 ? rest : rest.slice(0, end));
  });
  return execs;
}

/**
 * True when a shell or `source` runs code the guard cannot see: from a pipe, stdin, xargs, `<(...)` or `<<<`.
 * A heredoc body read by a shell is checked as commands, so that stays allowed.
 */
function readsCodeFromStdin(words, real) {
  const name = commandName(real[0]);
  // `/dev/./stdin` and `//dev/stdin` are stdin too, so the path is normalized first.
  const fromStdin = (file) =>
    !file ||
    file === '-' ||
    file.includes(SUBSTITUTION) ||
    globbedWords.has(file) ||
    bases().some((base) => STDIN_FILE.test(resolve(base, expandPath(file))));
  if (name === 'source' || name === '.')
    return fromStdin(shellOperands(real).file);
  if (!SHELLS.has(name)) return false;
  if (real.length === 2 && ['--version', '--help'].includes(real[1]))
    return false;
  // `xargs sh -c` adds the code from stdin.
  const wrappers = words.slice(0, Math.max(0, words.length - real.length));
  if (wrappers.some((word) => commandName(word) === 'xargs')) return true;
  const texts = shellString(real);
  // Each non-empty reading is checked as commands, so only an all-empty `-c` reads stdin.
  if (texts !== null) return texts.every((text) => !text.trim());
  if (words.scriptHeredoc || words.heredocStdin) return false;
  const { file, stdin } = shellOperands(real);
  return stdin || fromStdin(file);
}

/** The script file of a shell call, past options and their values. `stdin` is set by `-s`, which reads stdin even with arguments. */
function shellOperands(words) {
  let stdin = false;
  let i = 1;
  for (; i < words.length; i += 1) {
    const word = words[i];
    if (REDIRECT_TOKENS.has(word)) {
      i += 1;
      continue;
    }
    if (word === '--') {
      i += 1;
      break;
    }
    if (word === '-' || !/^[-+]/.test(word)) break;
    if (['--rcfile', '--init-file'].includes(word)) {
      i += 1;
      continue;
    }
    const group = /^[-+]([a-zA-Z]+)$/.exec(word)?.[1] ?? '';
    // zsh `-oshwordsplit` names the option in the same word.
    if (/^[oO]./.test(group)) continue;
    if (group.includes('s')) stdin = true;
    // Each `o` or `O` in a group takes the next word: `-euo pipefail`, `-Ox extglob`.
    i += (group.match(/[oO]/g) ?? []).length;
  }
  const file = words
    .slice(i)
    .find(
      (word, j, rest) =>
        !REDIRECT_TOKENS.has(word) && !REDIRECT_TOKENS.has(rest[j - 1] ?? ''),
    );
  return { file, stdin };
}

/** True when a word's glob form has an unquoted `*`, `?`, `[` or a brace list like `{a,b}` or `{1..3}`. */
function hasGlob(glob) {
  // A `[` only globs with a closing `]`, so the test commands `[` and `[[` are plain words. `(` is a zsh glob group.
  return /[*?(]|\[[^\]]*\]|\{[^}]*(,|\.\.)[^}]*\}/.test(
    glob.replace(/\\./g, ''),
  );
}

/**
 * A small shell tokenizer. It honors quotes and escapes, collects the text of `$(...)` and backticks
 * (also inside double quotes) in `nested`, and adds each word's glob form (quoted parts escaped) to `globWords`.
 */
function parseCommands(line, nested, globWords) {
  const commands = [[]];
  const heredocs = [];
  let word = null;
  let glob = null;
  let quote = '';
  // Open zsh glob groups in the current word, like the `(` in `/usr/bin/gi(t)`.
  let wordParens = 0;
  // Inside `[[ ... ]]` a pattern never makes file names, so no glob qualifier runs.
  let inTest = false;
  const add = (char, quoted) => {
    word = (word ?? '') + char;
    glob =
      (glob ?? '') +
      (quoted && /[*?[\]{},\\()]/.test(char) ? `\\${char}` : char);
  };
  const endWord = () => {
    if (word !== null) {
      // A zsh glob qualifier with `e` or `+`, like `*(e:'git push':)`, runs code.
      if (
        !inTest &&
        /\([^()]*[e+][^()]*\)$/.test((glob ?? '').replace(/\\./g, ''))
      )
        block(NO_UNCHECKABLE);
      if (word === '[[') inTest = true;
      if (word === ']]') inTest = false;
      commands.at(-1).push(word);
      globWords.push(glob ?? '');
      if (hasGlob(glob ?? '')) globbedWords.add(word);
    }
    word = null;
    glob = null;
    wordParens = 0;
  };
  const endCommand = () => {
    endWord();
    if (commands.at(-1).length > 0) commands.push([]);
  };
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const substitution = char === '`' || (char === '$' && line[i + 1] === '(');
    if (quote === "'") {
      if (char === quote) quote = '';
      else add(char, true);
    } else if (quote === '$') {
      // ANSI-C quote `$'...'`: bash and zsh decode the escapes.
      if (char === "'") quote = '';
      else if (char === '\\') {
        const [text, length] = ansiEscape(line.slice(i + 1));
        add(text, true);
        i += length;
      } else add(char, true);
    } else if (quote === '"' && char === '"') {
      quote = '';
    } else if (
      (char === '$' && isArithmetic(line, i + 1)) ||
      (char === '$' && line[i + 1] === '[') ||
      (quote === '' &&
        isArithmetic(line, i) &&
        word === null &&
        (commands.at(-1).length === 0 ||
          ['for', ...GROUP_KEYWORDS].includes(commands.at(-1).at(-1))))
    ) {
      // Arithmetic: `$((2*3))`, `$[1+2]`, `((i++))`, `for ((i=0; i<3; i++))`. No commands or globs,
      // but each `$(...)` inside still runs.
      const close = char === '$' && line[i + 1] === '[' ? ']' : ')';
      const end = arithmeticEnd(line, i + (char === '$' ? 1 : 0), close);
      // Skip the opening `$((`, `$[` or `((` so the arithmetic itself is not read as a `$(...)`.
      collectSubstitutions(line.slice(i + 2, end + 1), nested);
      if (char === '$') add(SUBSTITUTION, false);
      i = end;
    } else if (substitution) {
      const end = substitutionEnd(line, i);
      const text = line.slice(char === '`' ? i + 1 : i + 2, end);
      // Inside backticks, \` starts a nested substitution.
      nested.push(char === '`' ? text.replace(/\\`/g, '`') : text);
      add(SUBSTITUTION, false);
      i = end;
    } else if (quote === '"') {
      // A backslash-newline joins the lines, inside double quotes too.
      if (char === '\\' && line[i + 1] === '\n') i += 1;
      else add(char === '\\' ? (line[++i] ?? '') : char, true);
    } else if (char === '"' || char === "'") {
      quote = char;
      add('', true);
    } else if (char === '$' && (line[i + 1] === "'" || line[i + 1] === '"')) {
      // `$'...'` is an ANSI-C quote; bash reads `$"..."` like `"..."`.
      quote = line[i + 1] === "'" ? '$' : '"';
      add('', true);
      i += 1;
    } else if (char === '\\') {
      if (line[i + 1] === '\n') i += 1;
      else add(line[++i] ?? '', true);
    } else if (char === '#' && word === null) {
      // An unquoted `#` at the start of a word starts a comment. The newline still ends the command.
      const next = line.indexOf('\n', i);
      i = (next === -1 ? line.length : next) - 1;
    } else if (char === ' ' || char === '\t') {
      endWord();
    } else if (char === '\n') {
      endCommand();
      i = skipHeredocBodies(line, i + 1, heredocs.splice(0), nested) - 1;
    } else if (
      char === '<' &&
      line[i + 1] === '<' &&
      inArithmetic(line.slice(line.lastIndexOf('\n', i) + 1, i))
    ) {
      // `((x = 1<<2))` and `$[1<<2]` shift bits; there is no heredoc.
      add('<<', false);
      i += 1;
    } else if (char === '<' && line[i + 1] === '<' && line[i + 2] !== '<') {
      endWord();
      const match = /^<<-?\s*([^\s;&|<>()]+)/.exec(line.slice(i));
      // Only plain delimiters (`EOF`, `'EOF'`, `"EOF"`, `\EOF`); the guard may cut any other form wrong.
      if (
        match &&
        !/^(?:[\w.-]+|'[\w.-]+'|"[\w.-]+"|\\[\w.-]+)$/.test(match[1])
      )
        block(NO_HEREDOC_DELIMITER);
      if (match) {
        // A shell that reads the heredoc runs it as commands: `bash <<EOF`, `cat <<EOF | sh`.
        const reader = unwrap(commands.at(-1));
        const lineEnd = line.indexOf('\n', i);
        const ownLine = line.slice(
          line.lastIndexOf('\n', i) + 1,
          lineEnd === -1 ? line.length : lineEnd,
        );
        const script =
          (SHELLS.has(commandName(reader[0])) &&
            !reader.some((w) => /^-\w*c$/.test(w))) ||
          PIPE_TO_SHELL.test(ownLine);
        if (script) commands.at(-1).scriptHeredoc = true;
        heredocs.push({
          end: match[1].replace(/['"\\]/g, ''),
          expands: !/['"\\]/.test(match[1]),
          script,
        });
      }
      commands.at(-1).push('<<');
      i += match ? match[0].length - 1 : 1;
    } else if (
      char === '>' ||
      char === '<' ||
      (char === '&' && line[i + 1] === '>')
    ) {
      // A number right before the redirect is a file descriptor (`2>`), not a word.
      if (/^\d+$/.test(word ?? '')) {
        word = null;
        glob = null;
      }
      endWord();
      if (char === '&') i += 1; // `&>` sends stdout and stderr to a file, like `>`.
      const op = line[i];
      let operator = op;
      if (line.startsWith('<<<', i)) {
        operator = '<<<';
        i += 2;
      } else if (line[i + 1] === op || (op === '>' && line[i + 1] === '|'))
        operator += line[++i];
      // `>&2` copies a file descriptor and has no file target; `>& file` writes to a file.
      const fd =
        op === '>' && line[i + 1] === '&'
          ? /^&[\d-]+/.exec(line.slice(i + 1))
          : null;
      if (fd) i += fd[0].length;
      else {
        if (op === '>' && line[i + 1] === '&') i += 1;
        commands.at(-1).push(operator);
      }
    } else if (char === '(' && /^\w+(\[[^\]]*\])?\+?=$/.test(word ?? '')) {
      // An array `arr=(a $(b))` is one word. Its `$(...)` still runs.
      const end = substitutionEnd(line, i - 1);
      const text = line.slice(i + 1, end);
      collectSubstitutions(text, nested);
      add(`(${text})`, true);
      i = end;
    } else if (
      char === '(' &&
      line[i + 1] !== ')' &&
      (word !== null
        ? !GROUP_KEYWORDS.has(word)
        : commands.at(-1).length > 0 &&
          !GROUP_KEYWORDS.has(commands.at(-1).at(-1)) &&
          !REDIRECT_TOKENS.has(commands.at(-1).at(-1)))
    ) {
      // zsh reads `(` in a word or an argument as a glob group: `gi(t)`, `cat (.e)nv`.
      // `f()`, `in(x)`, `if (x)`, `<(x)` and a `(` that starts a command stay shell syntax.
      add(char, false);
      wordParens += 1;
    } else if (wordParens > 0 && (char === ')' || char === '|')) {
      add(char, false);
      if (char === ')') wordParens -= 1;
    } else if (';&|()'.includes(char)) {
      const previous = commands.at(-1);
      endCommand();
      // `cat <<EOF | sh`: the shell reads a heredoc body that is checked as commands.
      if (char === '|' && line[i + 1] === '|') i += 1;
      else if (char === '|' && previous.scriptHeredoc)
        commands.at(-1).heredocStdin = true;
    } else {
      add(char, false);
    }
  }
  endCommand();
  return commands.filter((words) => words.length > 0);
}

/**
 * True when `((` at `start` is arithmetic. Like bash, only when the inner `(` closes right before the outer `)`:
 * `$((2*3))` and `$(( (1+2) * 3 ))` are arithmetic, `$((git push) )` and `((cd x) && y)` are subshells.
 */
function isArithmetic(line, start) {
  if (!line.startsWith('((', start)) return false;
  const outer = arithmeticEnd(line, start, ')');
  return (
    outer < line.length && arithmeticEnd(line, start + 1, ')') === outer - 1
  );
}

/** Index of the `)` or `]` that closes the arithmetic opened at `start` (`((` or `[`). `$(...)` inside is skipped as a whole. */
function arithmeticEnd(line, start, close) {
  const open = close === ']' ? '[' : '(';
  let depth = 0;
  for (let i = start; i < line.length; i += 1) {
    if (
      line[i] === '`' ||
      (line[i] === '$' && line[i + 1] === '(' && i > start)
    )
      i = substitutionEnd(line, i);
    else if (line[i] === open) depth += 1;
    else if (line[i] === close && --depth === 0) return i;
  }
  return line.length;
}

/** True when the text before `<<` on its line leaves `((` or `$[` open, so `<<` is a shift. */
function inArithmetic(before) {
  return (
    before.split('((').length > before.split('))').length ||
    before.lastIndexOf('$[') > before.lastIndexOf(']')
  );
}

/** Decodes one escape of an ANSI-C quote. Returns the text and how many characters after the `\` it used. */
function ansiEscape(rest) {
  const simple = {
    n: '\n',
    t: '\t',
    r: '\r',
    a: '\u0007',
    b: '\b',
    e: '\u001b',
    E: '\u001b',
    f: '\f',
    v: '\v',
    '\\': '\\',
    "'": "'",
    '"': '"',
    '?': '?',
  };
  if (rest[0] in simple) return [simple[rest[0]], 1];
  const point = (code) => (code <= 0x10ffff ? String.fromCodePoint(code) : '');
  // macOS bash 3.2 reads `\x{67}` as one hex code.
  const hex =
    /^x\{([0-9a-fA-F]+)\}/.exec(rest) ?? /^x([0-9a-fA-F]{1,2})/.exec(rest);
  // bash 3.2 keeps one byte of a hex escape too: `\x{167}` is `g`.
  if (hex) return [point(parseInt(hex[1], 16) & 0xff), hex[0].length];
  const unicode = /^u([0-9a-fA-F]{1,4})|^U([0-9a-fA-F]{1,8})/.exec(rest);
  if (unicode)
    return [point(parseInt(unicode[1] ?? unicode[2], 16)), unicode[0].length];
  // bash and zsh keep one byte of an octal escape: `\547` is `g`.
  const octal = /^[0-7]{1,3}/.exec(rest);
  if (octal)
    return [String.fromCharCode(parseInt(octal[0], 8) & 0xff), octal[0].length];
  return [`\\${rest[0] ?? ''}`, rest.length > 0 ? 1 : 0];
}

/** Index of the `)` or backtick that closes the substitution at `start`. Quoted text and escapes are skipped. */
function substitutionEnd(line, start) {
  const backtick = line[start] === '`';
  let depth = 0;
  let quote = '';
  for (let i = start + 1; i < line.length; i += 1) {
    const char = line[i];
    if (char === '\\' && quote !== "'") i += 1;
    else if (quote) {
      // `$` stands for an ANSI-C quote `$'...'`, which ends at `'`.
      if (char === (quote === '$' ? "'" : quote)) quote = '';
    } else if (char === '$' && line[i + 1] === "'") {
      quote = '$';
      i += 1;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === '#' && /[\s;&|(]/.test(line[i - 1] ?? ' ')) {
      // A comment runs to the end of the line, and quotes in it mean nothing.
      const next = line.indexOf('\n', i);
      i = (next === -1 ? line.length : next) - 1;
    } else if (backtick) {
      if (char === '`') return i;
    } else if (char === '(') depth += 1;
    else if (char === ')' && --depth === 0) return i;
  }
  return line.length;
}

/** Skips heredoc bodies and returns where the commands go on. A shell reading the body runs it; others only expand `$(...)`. */
function skipHeredocBodies(line, start, heredocs, nested) {
  let at = start;
  for (const { end, expands, script } of heredocs) {
    const body = [];
    while (at < line.length) {
      const next = line.indexOf('\n', at);
      const text = line.slice(at, next === -1 ? line.length : next);
      at = next === -1 ? line.length : next + 1;
      if (text.trim() === end) break;
      body.push(text);
    }
    if (script) nested.push(body.join('\n'));
    else if (expands) collectSubstitutions(body.join('\n'), nested);
  }
  return at;
}

function collectSubstitutions(text, nested, depth = 0) {
  if (depth > MAX_NESTING) block('This command nests too deep to check.');
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '$' && isArithmetic(text, i + 1)) {
      // Arithmetic is not a command, but a `$(...)` inside it is.
      const end = arithmeticEnd(text, i + 1, ')');
      collectSubstitutions(text.slice(i + 3, end), nested, depth + 1);
      i = end;
    } else if (text[i] === '`' || (text[i] === '$' && text[i + 1] === '(')) {
      const end = substitutionEnd(text, i);
      nested.push(text.slice(text[i] === '`' ? i + 1 : i + 2, end));
      i = end;
    }
  }
}

/** Drops `VAR=1`, shell keywords and wrappers like `timeout 10`, so the real command comes first. */
function unwrap(words) {
  let rest = words;
  while (rest.length > 0) {
    const name = commandName(rest[0]);
    const testEnd = { '[[': ']]', '[': ']' }[rest[0]];
    if (/^\w+(\[[^\]]*\])?\+?=/.test(rest[0]) || SHELL_KEYWORDS.has(rest[0])) {
      rest = rest.slice(1);
    } else if (rest[0] === 'function') {
      // `function f g { git push }`: zsh allows more names, so the body starts after `{`.
      const brace = rest.indexOf('{');
      rest = brace < 0 ? [] : rest.slice(brace + 1);
    } else if (rest[0] === 'repeat') {
      // zsh `repeat 3 git push`.
      rest = rest.slice(2);
    } else if (testEnd && rest.includes(testEnd)) {
      // zsh short form `if [[ -n x ]] git push`: the command follows the test.
      rest = rest.slice(rest.indexOf(testEnd) + 1);
    } else if (name === 'env' && envSplit(rest)) {
      rest = envSplit(rest);
    } else if (
      WRAPPERS.has(name) &&
      // `command -v x` only prints a path.
      !(name === 'command' && /^-[vV]$/.test(rest[1] ?? ''))
    ) {
      rest = skipOptions(rest.slice(1), new Set(WRAPPERS.get(name))).slice(
        WRAPPER_ARGS.get(name) ?? 0,
      );
    } else if (
      name === 'aws-vault' &&
      vaultRunsAllowed(awsVaultCall(rest).inner)
    ) {
      rest = awsVaultCall(rest).inner;
    } else {
      break;
    }
  }
  return rest;
}

/** `env -S "git push"` splits its value into words with quotes, like a tiny shell. Returns the command it runs, or null. */
function envSplit(words) {
  const valueFlags = new Set(WRAPPERS.get('env'));
  for (let i = 1; i < words.length && words[i].startsWith('-'); i += 1) {
    // `S` can sit in a group of short flags: `env -iS "cmd"`.
    const split = /^(?:-[a-zA-Z0-9]*S|--split-string=?)(.*)$/.exec(words[i]);
    if (split) {
      const value = split[1] || (words[i + 1] ?? '');
      // `\_` is a space in an `env -S` string.
      const inner = parseCommands(value.replace(/\\_/g, ' '), [], []).flat();
      return [...inner, ...words.slice(split[1] ? i + 1 : i + 2)];
    }
    if (valueFlags.has(words[i])) i += 1;
  }
  return null;
}

function commandName(word = '') {
  return word.split('/').pop() ?? '';
}

/** The subcommand of `aws-vault` and the command `exec` runs: `aws-vault --debug exec p -- aws s3 ls`. */
function awsVaultCall(words) {
  const [sub = '', ...args] = skipOptions(
    words.slice(1),
    AWS_VAULT_GLOBAL_VALUE_FLAGS,
  );
  if (sub !== 'exec') return { sub, inner: [] };
  // The command comes after the profile name and its options, with or without `--`.
  const profileOn = skipOptions(args, AWS_VAULT_VALUE_FLAGS).slice(1);
  return { sub, inner: skipOptions(profileOn, AWS_VAULT_VALUE_FLAGS) };
}

/** True when `aws-vault exec` runs the AWS CLI, Terraform or a deploy tool, also behind a launcher. Anything else could print the keys. */
function vaultRunsAllowed(inner, depth = 0) {
  const words = unwrap(inner);
  if (words.length === 0 || depth > MAX_NESTING) return false;
  const name = commandName(words[0]);
  if (name === 'aws' || TERRAFORMS.has(name) || DEPLOY_TOOLS.has(name))
    return true;
  const next = launched(words);
  return Boolean(next?.length) && vaultRunsAllowed(next, depth + 1);
}

/** The strings a command may run as shell code: `sh -c "cmd"`, `eval cmd` or a launcher's `-c`, or null. */
function shellString(words) {
  const name = commandName(words[0]);
  if (name === 'eval') return [withoutDashes(words.slice(1)).join(' ')];
  if (name === 'watch')
    return [skipOptions(words.slice(1), WATCH_VALUE_FLAGS).join(' ')];
  // `trap 'git push' EXIT` runs its first operand as shell code later.
  if (name === 'trap') {
    const [action] = skipOptions(words.slice(1));
    return action ? [action] : null;
  }
  // Any case, so pwsh `-Command` counts too.
  const flag = SHELLS.has(name)
    ? words.findIndex((word) => /^-[a-zA-Z]*c[a-zA-Z]*$/i.test(word))
    : -1;
  if (flag > 0) return afterShellOptions(words.slice(flag));
  const text = launcherCall(words);
  return text === null ? null : [text];
}

/** Every possible string after a shell's options: `bash -c -o pipefail "cmd"` gives `-o pipefail cmd`, `pipefail cmd` and `cmd`. */
function afterShellOptions(words) {
  const strings = new Set();
  const add = (text) => {
    shellStrings += 1;
    shellChars += text.length;
    if (shellStrings > MAX_SHELL_STRINGS || shellChars > MAX_SHELL_CHARS)
      block('This command has too many shell options to check.');
    strings.add(text);
  };
  const seen = new Set();
  const starts = [0];
  while (starts.length > 0) {
    const i = starts.pop();
    if (seen.has(i)) continue;
    seen.add(i);
    const word = words[i];
    if (word === undefined || !/^[-+]/.test(word)) {
      add(words.slice(i).join(' '));
    } else if (word === '--' || word === '-') {
      add(words.slice(i + 1).join(' '));
    } else {
      // Fail closed: zsh `-b` ends the options, so the string itself can start with `-` or `+`.
      if (i > 0) add(words.slice(i).join(' '));
      starts.push(i + 1);
      // The word after `-o`/`-O` is a value in bash but can be the string or another option in zsh, so follow both readings.
      if (/^[-+][a-zA-Z]*[oO]/.test(word) && i + 1 < words.length)
        starts.push(i + 2);
    }
  }
  return [...strings];
}

/** Drops one `--` or `-` before a shell string: `bash -c -- "cmd"` and `eval -- cmd` still run `cmd`. */
function withoutDashes(words) {
  return ['--', '-'].includes(words[0]) ? words.slice(1) : words;
}

/** The shell string of `npx -c "cmd"`, `npm exec --call "cmd"` or `pnpm dlx -c "cmd"`, or null. */
function launcherCall(words) {
  const name = commandName(words[0]);
  let i = 1;
  if (!LAUNCHERS.has(name)) {
    const script = scriptName(words);
    if (!PACKAGE_MANAGERS.has(name) || !['exec', 'dlx', 'x'].includes(script))
      return null;
    i = words.indexOf(script) + 1;
    // Yarn 2+ `yarn exec` runs its words as a shell string. Leading options and `--` are not part of it.
    if (name === 'yarn' && script === 'exec')
      return skipOptions(words.slice(i)).join(' ');
  }
  // Only options before the command count: `npx jest -c conf.js` is jest's own `-c`.
  for (; i < words.length && words[i].startsWith('-'); i += 1) {
    if (LAUNCHER_CALL_FLAGS.has(words[i])) return words.slice(i + 1).join(' ');
    if (words[i].startsWith('--call='))
      return [words[i].slice('--call='.length), ...words.slice(i + 1)].join(
        ' ',
      );
    if (LAUNCHER_VALUE_FLAGS.has(words[i])) i += 1;
  }
  return null;
}

/** Drops the version of the package a launcher runs: `cdk@latest` gives `cdk`, `@scope/x@2` gives `@scope/x`. */
function withoutVersion([first, ...rest]) {
  return first === undefined
    ? []
    : [first.replace(/(?<=.)@[^@/]*$/, ''), ...rest];
}

/** Drops options before the subcommand, like `-C dir` in `git -C dir commit`. */
function skipOptions(words, valueFlags = new Set()) {
  let i = 0;
  while (i < words.length && words[i].startsWith('-'))
    i += valueFlags.has(words[i]) ? 2 : 1;
  return words.slice(i);
}

/** The script a package manager runs: `pnpm -r run test:e2e` gives `test:e2e`. */
function scriptName(words) {
  const [first = '', ...rest] = skipOptions(words.slice(1), PM_VALUE_FLAGS);
  return first === 'run' || first === 'run-script'
    ? (skipOptions(rest)[0] ?? '')
    : first;
}

/** The command a launcher runs: `npx -y jest`, `pnpm exec oxfmt src` or `node .../oxfmt src` give `jest` / `oxfmt src`. */
function launched(words) {
  const name = commandName(words[0]);
  if (LAUNCHERS.has(name))
    return withoutVersion(skipOptions(words.slice(1), LAUNCHER_VALUE_FLAGS));
  if (name === 'node') {
    const script = skipOptions(words.slice(1));
    return FIXERS.has(commandName(script[0])) ? script : null;
  }
  if (!PACKAGE_MANAGERS.has(name)) return null;
  const script = scriptName(words);
  const at = words.indexOf(script);
  if (['exec', 'dlx', 'x'].includes(script))
    return withoutVersion(
      skipOptions(words.slice(at + 1), LAUNCHER_VALUE_FLAGS),
    );
  // `pnpm jest`, `pnpm oxfmt src` or `pnpm cdk deploy` run the binary when no script has that name.
  return RUNNERS.has(script) ||
    FIXERS.has(script) ||
    DEPLOY_TOOLS.has(script) ||
    TERRAFORMS.has(script)
    ? words.slice(at)
    : null;
}

/** hardRule and secretRule, also on the command a launcher runs: `npx cdk deploy`, `pnpm exec terraform apply`. */
function commandRule(words, depth = 0) {
  if (depth > MAX_NESTING) return 'This command nests too deep to check.';
  // Fail closed: `$a push`, `{git,push}` or zsh `=git push` hides the real command.
  if (isDynamic(words[0] ?? '') || (words[0] ?? '').startsWith('='))
    return NO_DYNAMIC_COMMAND;
  // The same for the subcommand of a checked tool: `git $(echo push)`, `pnpm tes?`.
  const name = commandName(words[0]);
  if (
    GUARDED_TOOLS.has(name) ||
    TERRAFORMS.has(name) ||
    DEPLOY_TOOLS.has(name)
  ) {
    const flags =
      {
        git: GIT_VALUE_FLAGS,
        aws: AWS_VALUE_FLAGS,
        gcloud: GCLOUD_VALUE_FLAGS,
        docker: DOCKER_VALUE_FLAGS,
        'docker-compose': DOCKER_VALUE_FLAGS,
      }[name] ??
      (PACKAGE_MANAGERS.has(name) ? PM_VALUE_FLAGS : LAUNCHER_VALUE_FLAGS);
    const subs = skipOptions(words.slice(1), flags);
    // Two words for tools with nested commands (`gh pr create`, `docker volume rm`). `gh api` takes a path.
    const twoWords =
      ['gcloud', 'aws', 'docker', 'docker-compose'].includes(name) ||
      (name === 'gh' && subs[0] !== 'api');
    // The script after `run`: `npm run $x`, `pnpm run tes?`.
    const script = PACKAGE_MANAGERS.has(name) ? [scriptName(words)] : [];
    if ([...subs.slice(0, twoWords ? 2 : 1), ...script].some(isDynamic))
      return NO_DYNAMIC_COMMAND;
  }
  const rule = hardRule(words) ?? secretRule(words);
  if (rule) return rule;
  const inner = launched(words) ?? pnpmFallback(words);
  return inner?.length ? commandRule(unwrap(inner), depth + 1) : null;
}

/** A word the shell turns into something else: a variable, `$(...)` or a glob. */
function isDynamic(word) {
  const path = expandPath(word);
  return (
    path.includes('$') || path.includes(SUBSTITUTION) || globbedWords.has(word)
  );
}

/** pnpm runs a command on PATH when no script or pnpm command has its name: `pnpm git push` runs git. */
function pnpmFallback(words) {
  if (commandName(words[0]) !== 'pnpm') return null;
  const rest = skipOptions(words.slice(1), PM_VALUE_FLAGS);
  return rest.length > 0 && !['run', 'run-script'].includes(rest[0])
    ? rest
    : null;
}

/** The service and operation of an AWS CLI call, past global options: `aws --profile p ecs list-services`. */
function awsCall(words) {
  const [service = '', ...rest] = skipOptions(words.slice(1), AWS_VALUE_FLAGS);
  const [operation = ''] = skipOptions(rest, AWS_VALUE_FLAGS);
  return [service, operation];
}

/** Returns the hard rule a command breaks (commit, push, pull, deploy, publish), or null. */
function hardRule(words) {
  const name = commandName(words[0]);
  const [sub = '', next = '', ...rest] = skipOptions(
    words.slice(1),
    name === 'git' ? GIT_VALUE_FLAGS : undefined,
  );
  if (
    name === 'git' &&
    (GIT_BLOCKED.has(sub) ||
      (sub === 'reset' && words.includes('--hard')) ||
      (sub === 'tag' && createsTag([next, ...rest].filter(Boolean))))
  ) {
    return NO_COMMIT;
  }
  if (name === 'gh') {
    if (sub === 'pr' && ['create', 'merge'].includes(next)) return NO_COMMIT;
    if (
      sub === 'release' ||
      (sub === 'workflow' && next === 'run') ||
      (sub === 'run' && next === 'rerun')
    ) {
      return NO_DEPLOY;
    }
    if (sub === 'api' && writesWithGhApi(words)) return NO_GITHUB_WRITE;
    // Setting DEPLOY_TARGET or deploy secrets is for people.
    if (
      (sub === 'variable' &&
        words.some((word) => ['set', 'delete'].includes(word))) ||
      (sub === 'secret' &&
        words.some((word) => ['set', 'delete', 'remove'].includes(word)))
    ) {
      return NO_GITHUB_WRITE;
    }
  }
  if (
    TERRAFORMS.has(name) &&
    words.slice(1).some((word) => TERRAFORM_BLOCKED.has(word))
  )
    return NO_DEPLOY;
  if (name === 'docker' && (words.includes('push') || words.includes('--push')))
    return NO_DEPLOY;
  if (deletesDockerData(words)) return NO_DATA_DELETE;
  const claudeArgs = claudeCall(words);
  if (
    claudeArgs &&
    !(claudeArgs.length === 1 && CLAUDE_INFO_FLAGS.has(claudeArgs[0]))
  )
    return NO_NESTED_CLAUDE;
  if (name === 'gcloud' && words.some((word) => GCLOUD_WRITES.has(word)))
    return NO_DEPLOY;
  if (name === 'aws') {
    const [service, operation] = awsCall(words);
    if (
      AWS_SECRET_READS.has(operation) ||
      (service === 'configure' && operation === 'get')
    )
      return NO_SECRETS;
    if (
      service &&
      service !== 'help' &&
      !AWS_READ.test(operation) &&
      !AWS_READ_OPS.has(operation)
    )
      return NO_AWS_WRITE;
  }
  if (DEPLOY_TOOLS.has(name)) {
    const [command] = skipOptions(words.slice(1));
    if (command && !DEPLOY_TOOL_READS.has(command)) return NO_DEPLOY;
  }
  if (PACKAGE_MANAGERS.has(name) && words.includes('publish')) return NO_DEPLOY;
  if (
    PACKAGE_MANAGERS.has(name) &&
    scriptName(words) === 'version' &&
    !words.includes('--no-git-tag-version')
  ) {
    // `npm version patch` makes a commit and a tag; yarn 1 does it even without a version.
    const bump = skipOptions(words.slice(words.indexOf('version') + 1));
    if (bump.length > 0 || name === 'yarn') return NO_COMMIT;
  }
  return null;
}

/** The args of a nested Claude Code CLI run (`claude`, `claude-code`, `node .../@anthropic-ai/claude-code/cli.js`), or null. */
function claudeCall(words) {
  const name = commandName(words[0]);
  if (name === 'claude' || name === 'claude-code') return words.slice(1);
  if (!SCRIPT_RUNNERS.has(name)) return null;
  // Only the script word counts, so `node x.mjs --name claude-code` is fine. `bun run x` and `deno run x` skip `run`.
  let script = skipOptions(words.slice(1));
  if (script[0] === 'run') script = skipOptions(script.slice(1));
  const [file = ''] = script;
  if (file.includes('claude-code') || commandName(file) === 'claude')
    return script.slice(1);
  // An option value like `-r ./x.js` can hide the script word, so a CLI path anywhere counts too.
  const at = words.findIndex((word, i) => i > 0 && CLAUDE_CLI_PATH.test(word));
  return at > 0 ? words.slice(at + 1) : null;
}

/** `docker volume rm|prune`, `docker system prune --volumes` and `docker compose down -v` delete local data. */
function deletesDockerData(words) {
  const name = commandName(words[0]);
  const args = words.slice(1);
  const dropsVolumes = args.some((word) =>
    /^(-[a-zA-Z]*v[a-zA-Z]*|--volumes(=true)?)$/.test(word),
  );
  if (name === 'docker-compose') return args.includes('down') && dropsVolumes;
  if (name !== 'docker') return false;
  if (args.includes('volume'))
    return args.some((word) => ['rm', 'remove', 'prune'].includes(word));
  if (args.includes('system') && args.includes('prune'))
    return args.some((word) => /^--volumes(=true)?$/.test(word));
  return args.includes('compose') && args.includes('down') && dropsVolumes;
}

/** `gh api` writes with a method other than GET, or with fields (which make it a POST). */
function writesWithGhApi(words) {
  const method =
    words.find((word, i) => ['-X', '--method'].includes(words[i - 1])) ??
    words
      .find((word) => /^(-X.|--method=)/.test(word))
      ?.replace(/^(-X|--method=)/, '');
  return (
    (method !== undefined && method.toUpperCase() !== 'GET') ||
    words.some((word) => /^(-f|-F|--field|--raw-field|--input)/.test(word))
  );
}

/** `git tag` alone or with listing options only lists tags; anything else creates or deletes one. */
function createsTag(args) {
  if (
    args.some((word) =>
      /^-[dfasmFu]|^--(delete|force|annotate|sign|message|file)/.test(word),
    )
  )
    return true;
  const listing = args.some((word) =>
    /^(-l|-n|--list|--contains|--no-contains|--points-at|--merged|--no-merged|--sort|--format|--column)/.test(
      word,
    ),
  );
  return !listing && args.some((word) => !word.startsWith('-'));
}

/** Commands that print secrets: Secret Manager values, access tokens and raw Terraform outputs. */
function secretRule(words) {
  const name = commandName(words[0]);
  const [sub = '', next = ''] = skipOptions(words.slice(1));
  if (
    SECRET_MANAGERS.has(name) &&
    !(words.length === 2 && INFO_ARGS.has(words[1]))
  )
    return NO_SECRET_MANAGER;
  if (
    name === 'gcloud' &&
    ((words.includes('secrets') && words.includes('access')) ||
      words.includes('config-helper') ||
      words.some((word) => word.startsWith('print-')))
  ) {
    return NO_SECRETS;
  }
  if (
    name === 'gh' &&
    sub === 'auth' &&
    (next === 'token' || words.some((word) => /^(-t|--show-token)$/.test(word)))
  ) {
    return NO_SECRETS;
  }
  // `aws-vault export` and `login` print keys or a sign-in link. `exec` may only run aws, Terraform or a deploy tool.
  if (name === 'aws-vault') {
    const vault = awsVaultCall(words);
    if (
      ['export', 'login'].includes(vault.sub) ||
      (vault.sub === 'exec' && !vaultRunsAllowed(vault.inner))
    )
      return NO_SECRETS;
  }
  // Go flags also take `--raw` and any value after `=`, like `-raw=1`.
  const raw = words.some((word) => /^--?(raw|json)(=.*)?$/i.test(word));
  return TERRAFORMS.has(name) && ['output', 'show'].includes(sub) && raw
    ? NO_SECRETS
    : null;
}

function isTestRun(words, depth = 0) {
  if (depth > MAX_NESTING) return true;
  const name = commandName(words[0]);
  if (RUNNERS.has(name)) return true;
  const inner = launched(words);
  if (inner) return inner.length > 0 && isTestRun(inner, depth + 1);
  if (name === 'node') {
    return (
      words.includes('--test') ||
      words.some((word) => /(^|\/)(jest|vitest|mocha)(\.js)?$/.test(word))
    );
  }
  return (
    PACKAGE_MANAGERS.has(name) && /^(test|t|e2e)(:|$)/.test(scriptName(words))
  );
}

function isAppStart(words) {
  const name = commandName(words[0]);
  if (
    words.includes('start') &&
    words.some((word) => /(^|\/)(nest(\.js)?|@nestjs\/cli)$/.test(word))
  )
    return true;
  const [sub, next] = skipOptions(words.slice(1));
  if (
    name === 'docker' &&
    (sub === 'run' || (sub === 'container' && next === 'run'))
  )
    return true;
  if (
    PACKAGE_MANAGERS.has(name) &&
    /^(start|dev|serve)(:|$)/.test(scriptName(words))
  )
    return true;
  if (
    name === 'node' &&
    words.slice(1).some((word) => word === '.' || word === './')
  )
    return true;
  // Runs the entry file directly: `node dist/src/main.js`, `npx ts-node src/main.ts`.
  return (
    EXECUTORS.has(name) &&
    words.some((word) =>
      /(^|\/)(dist\/(src\/)?main(\.js)?|src\/main\.ts)$/.test(word),
    )
  );
}

/** Tester Bash commands that rewrite app code: fixers, in-place edits, installs, copies, deletes and redirects. */
function changesAppCode(words, depth = 0) {
  if (depth > MAX_NESTING) return true;
  const name = commandName(words[0]);
  // Options, redirects and redirect targets are not file operands.
  const operands = words
    .slice(1)
    .filter(
      (word, i, rest) =>
        !word.startsWith('-') &&
        !REDIRECT_TOKENS.has(word) &&
        !REDIRECT_TOKENS.has(rest[i - 1] ?? ''),
    );
  const valueOf = (pattern) => {
    const i = words.findIndex((word) => pattern.test(word));
    return i < 0 ? undefined : (words[i].split('=')[1] ?? words[i + 1]);
  };
  if (words.some((word, i) => REDIRECTS.has(word) && isAppPath(words[i + 1])))
    return true;
  const inner = launched(words);
  if (inner) return changesAppCode(inner, depth + 1);
  if (PACKAGE_MANAGERS.has(name)) {
    const script = scriptName(words);
    const rest = skipOptions(words.slice(words.indexOf(script) + 1));
    return (
      /^(lint|format|add|remove|rm|uninstall|update|up|upgrade)$/.test(
        script,
      ) ||
      (['install', 'i'].includes(script) && rest.length > 0) ||
      (script === 'pkg' && ['set', 'delete'].includes(rest[0] ?? ''))
    );
  }
  if (
    (name === 'oxlint' && words.some((word) => word.startsWith('--fix'))) ||
    (name === 'oxfmt' && !words.includes('--check'))
  ) {
    return operands.length === 0 || operands.some(isAppPath);
  }
  if (name === 'sed' || name === 'perl')
    return words.some((word) => /^(-\w*i|--in-place)/.test(word));
  if (name === 'awk' || name === 'gawk') return words.includes('inplace');
  if (name === 'patch') return !words.includes('--dry-run');
  if (name === 'git')
    return GIT_FILE_WRITES.has(
      skipOptions(words.slice(1), GIT_VALUE_FLAGS)[0] ?? '',
    );
  if (name === 'dd')
    return words.some(
      (word) => word.startsWith('of=') && isAppPath(word.slice(3)),
    );
  if (name === 'curl')
    return (
      isAppPath(valueOf(/^(-o|--output)/)) ||
      (words.includes('-O') && isAppPath('.'))
    );
  if (name === 'wget')
    return isAppPath(
      valueOf(/^(-O|--output-document)/) ??
        valueOf(/^(-P|--directory-prefix)/) ??
        '.',
    );
  if (
    name === 'tar' &&
    words.some((word) => /^-?[a-zA-Z]*x|^--(extract|get)$/.test(word))
  ) {
    return isAppPath(valueOf(/^(-C|--directory)/) ?? '.');
  }
  if (name === 'find') {
    const exec = words.findIndex((word) =>
      ['-exec', '-execdir', '-ok'].includes(word),
    );
    if (exec >= 0 && changesAppCode(words.slice(exec + 1), depth + 1))
      return true;
    return words.includes('-delete') && operands.some(isAppPath);
  }
  if (['mv', 'ln'].includes(name)) return operands.some(isAppPath);
  if (['cp', 'install', 'rsync'].includes(name)) {
    return isAppPath(
      valueOf(/^-[a-zA-Z]*t$|^--target-directory/) ?? operands.at(-1),
    );
  }
  return (
    ['rm', 'touch', 'truncate', 'unlink', 'tee'].includes(name) &&
    operands.some(isAppPath)
  );
}

function isTesterFile(filePath) {
  const rel = projectPath(filePath);
  return (
    rel !== null &&
    (/\.(spec|e2e-spec)\.ts$/.test(rel) ||
      rel.startsWith('test/') ||
      (rel.startsWith('tasks/') && rel.endsWith('.md')))
  );
}

/**
 * A project file that is not the tester's and not build output, seen from the project root or any `cd` target.
 * Paths outside the project are fine.
 */
function isAppPath(target) {
  if (!target) return false;
  const path = expandPath(target);
  // An unknown `$NAME` or `$(...)` could point anywhere, so it counts as app code.
  if (path.includes('$') || path.includes(SUBSTITUTION)) return true;
  return bases().some((base) => {
    const full = resolve(base, path);
    const rel = projectPath(full);
    return (
      rel !== null &&
      !/^(dist|coverage|node_modules)(\/|$)/.test(rel) &&
      !isTesterFile(full)
    );
  });
}

/** `~`, `$HOME` and `$TMPDIR` as the shell expands them. Other variables stay as they are. */
function expandPath(word) {
  // Only `${NAME}`, or a bare `$NAME` not followed by a word character, `:` or `[`. `${HOME:0:0}` and zsh `$HOME:h` stay dynamic.
  // `$PWD` is known only while there is one possible folder.
  return word
    .replace(/^~(?=\/|$)/, homedir())
    .replace(
      /\$(?:\{(HOME|TMPDIR|PWD)\}|(HOME|TMPDIR|PWD)(?![\w:[]))/g,
      (whole, braced, bare) => {
        const name = braced ?? bare;
        if (name !== 'PWD') return process.env[name] ?? whole;
        const all = bases();
        return all.length === 1 ? all[0] : whole;
      },
    );
}

/** The path inside the project (`''` is the root), or null when it is outside. Symlinks are followed. */
function projectPath(filePath) {
  const rel = relative(projectDir, realPathOf(resolve(projectDir, filePath)))
    .split('\\')
    .join('/');
  return rel === '..' || rel.startsWith('../') || isAbsolute(rel) ? null : rel;
}

/** A path in the system temp folder, where the tester may keep scratch files. Never a project file, even when the project is in /tmp. */
function isTempPath(filePath) {
  if (projectPath(filePath) !== null) return false;
  const full = realPathOf(resolve(projectDir, filePath));
  return [tmpdir(), '/tmp', '/private/tmp'].some((dir) => {
    const rel = relative(realPathOf(dir), full);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  });
}

/** Resolves symlinks in the part of the path that exists, so a link from test/ into src/ is caught. Cached. */
function realPathOf(path) {
  // No system opens a path this long (Linux allows 4,096 bytes), so it is returned as it is. SECRET_PATH still checks its text.
  if (path.length > 4096) return path;
  if (!realPaths.has(path)) realPaths.set(path, followLinks(path, 0));
  return realPaths.get(path);
}

/**
 * Walks up (in a loop, so deep paths cannot overflow the stack) to the first cached or existing folder,
 * then caches each missing part on the way back down. So each new path costs only a few file system calls.
 */
function followLinks(path, depth) {
  const missing = [];
  let current = path;
  let real;
  for (;;) {
    if (current !== path && realPaths.has(current)) {
      real = realPaths.get(current);
      break;
    }
    try {
      real = realpathSync(current);
      break;
    } catch {
      // A dangling symlink still points somewhere: a write through it creates the target.
      const link = readLink(current);
      if (link !== null && depth < MAX_NESTING) {
        return followLinks(
          join(
            resolve(dirname(current), link),
            ...missing.map((part) => basename(part)).reverse(),
          ),
          depth + 1,
        );
      }
      const parent = dirname(current);
      if (parent === current) return path;
      missing.push(current);
      current = parent;
    }
  }
  for (const part of missing.reverse()) {
    real = join(real, basename(part));
    realPaths.set(part, real);
  }
  return real;
}

function readLink(path) {
  try {
    return readlinkSync(path);
  } catch {
    return null;
  }
}
