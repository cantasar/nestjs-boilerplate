#!/usr/bin/env node
// PreToolUse guard for the team rules: env and secret files, commit/push/deploy, tests by the tester only, and tester writes.
// Exit code 2 blocks the call; it stops mistakes and is not a sandbox.
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
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
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const GREPS = new Set(['grep', 'egrep', 'fgrep', 'ggrep', 'rgrep']);
const REDIRECTS = new Set(['>', '>>', '>|']);
const REDIRECT_TOKENS = new Set([...REDIRECTS, '<', '<<']);
// Words that only wrap the real command, with their options that take a value.
const WRAPPERS = new Map([
  ['time', ['-f', '-o']],
  ['env', ['-u', '-C', '--unset', '--chdir']],
  ['nice', ['-n', '--adjustment']],
  ['nohup', []],
  ['exec', ['-a']],
  ['command', []],
  ['corepack', []],
  ['sudo', ['-u', '-g', '-C', '-D', '-h', '-p', '-U']],
  ['xargs', ['-n', '-I', '-L', '-P', '-d', '-E', '-s', '-a']],
  ['timeout', ['-s', '-k', '--signal', '--kill-after']],
  ['gtimeout', ['-s', '-k', '--signal', '--kill-after']],
  ['stdbuf', ['-i', '-o', '-e']],
  ['watch', ['-n', '--interval']],
  ['caffeinate', ['-t', '-w']],
  ['script', ['-t']],
]);
// Wrappers with plain words before the command: the duration in `timeout 10 x`, the file in `script -q log x`.
const WRAPPER_ARGS = new Map([
  ['timeout', 1],
  ['gtimeout', 1],
  ['script', 1],
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
const SECRET_PATH = /(^|\/)\.(aws|ssh)\/|\.config\/(gcloud|gh)\//;

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
const NO_TESTS =
  'Only the tester agent runs tests. Ask the tester agent to do it.';
const NO_APP_START =
  'Starting the app is a smoke test. Ask the tester agent, or the user can run it.';
const TESTER_SCOPE =
  'The tester may only write *.spec.ts, files in test/ and MDs in tasks/, also through Bash (temp files: use an absolute path like /tmp/x). Put app-code fixes in tasks/corrections/.';

// Folders that `cd` or `pushd` moved to earlier in the command line. Tester paths are checked from each of them.
const cdTargets = [];
let envNames;

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  block('The tool call could not be read, so it is blocked to be safe.');
}

const tool = String(input?.tool_name ?? '');
const args = input?.tool_input ?? {};
const isTester = Boolean(input?.agent_id) && input?.agent_type === 'tester';
const projectDir = realPathOf(
  resolve(process.env.CLAUDE_PROJECT_DIR ?? input?.cwd ?? process.cwd()),
);

if (FILE_TOOLS.has(tool)) {
  const filePath = String(args.file_path ?? args.notebook_path ?? '');
  if (ENV_NAME.test(basename(filePath))) block(NO_ENV);
  if (SECRET_FILE.test(filePath) || SECRET_PATH.test(filePath))
    block(NO_SECRETS);
  if (isTester && WRITE_TOOLS.has(tool) && !isTesterFile(filePath))
    block(TESTER_SCOPE);
}
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
  if (SECRET_FILE.test(path) || SECRET_PATH.test(path)) block(NO_SECRETS);
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
  const globWords = [];
  const commands = splitCommand(command, 0, globWords);
  if (dotGlobs(globWords).some(globMatchesEnv)) block(NO_ENV);
  const secret = (word) =>
    (SECRET_FILE.test(word) || SECRET_PATH.test(word)) &&
    !word.startsWith('-var-file=');
  if (commands.some((words) => fileWords(words).some(secret)))
    block(NO_SECRETS);
  for (const words of commands) {
    if (['cd', 'pushd'].includes(commandName(words[0]))) {
      cdTargets.push(
        resolve(
          cdTargets.at(-1) ?? projectDir,
          expandPath(words[1] ?? homedir()),
        ),
      );
      continue;
    }
    if (searchesIgnoredFiles(words)) {
      block(
        "This search can read ignored files like .env. Use the Grep tool, `git grep`, or grep with --exclude='.env*'.",
      );
    }
    const rule = hardRule(words) ?? secretRule(words);
    if (rule) block(rule);
    if (!isTester && isTestRun(words)) block(NO_TESTS);
    if (!isTester && isAppStart(words)) block(NO_APP_START);
    if (isTester && changesAppCode(words)) block(TESTER_SCOPE);
  }
}

/** Words that can name files. A grep or rg pattern is text, not a file. */
function fileWords(words) {
  const name = commandName(words[0]);
  if (
    (!GREPS.has(name) && name !== 'rg') ||
    words.some((word) => /^(-e|-f|--regexp|--file)/.test(word))
  )
    return words;
  let pattern = 1;
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

/** Shell words with unquoted glob characters (`.*`, `.en?`, `{.,}env`) that can expand to a dotfile. */
function dotGlobs(globWords) {
  return globWords
    .map((glob) => glob.split('/').pop() ?? '')
    .filter(
      (name) =>
        /(^|[^\\])[*?[{]/.test(name) &&
        (name.startsWith('.') || /(^|[^\\])\{/.test(name)),
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
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '\\') {
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
  const commands = parseCommands(line, nested, globWords).flatMap((words) => {
    // Linux `script -c "cmd" file` runs a command string.
    if (commandName(words[0]) === 'script' && words.includes('-c')) {
      return splitCommand(
        words[words.indexOf('-c') + 1] ?? '',
        depth + 1,
        globWords,
      );
    }
    const real = unwrap(words);
    const name = commandName(real[0]);
    if (name === 'eval')
      return splitCommand(real.slice(1).join(' '), depth + 1, globWords);
    const flag = SHELLS.has(name)
      ? real.findIndex((word) => /^-\w*c$/.test(word))
      : -1;
    return flag > 0
      ? splitCommand(real.slice(flag + 1).join(' '), depth + 1, globWords)
      : [real];
  });
  const inner = nested.flatMap((text) =>
    splitCommand(text, depth + 1, globWords),
  );
  return [...commands, ...inner].filter((words) => words.length > 0);
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
  const add = (char, quoted) => {
    word = (word ?? '') + char;
    glob =
      (glob ?? '') + (quoted && /[*?[\]{},\\]/.test(char) ? `\\${char}` : char);
  };
  const endWord = () => {
    if (word !== null) {
      commands.at(-1).push(word);
      globWords.push(glob ?? '');
    }
    word = null;
    glob = null;
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
    } else if (quote === '"' && char === '"') {
      quote = '';
    } else if (substitution) {
      const end = substitutionEnd(line, i);
      const text = line.slice(char === '`' ? i + 1 : i + 2, end);
      // Inside backticks, \` starts a nested substitution.
      nested.push(char === '`' ? text.replace(/\\`/g, '`') : text);
      add(SUBSTITUTION, false);
      i = end;
    } else if (quote === '"') {
      add(char === '\\' ? (line[++i] ?? '') : char, true);
    } else if (char === '"' || char === "'") {
      quote = char;
      add('', true);
    } else if (char === '\\') {
      add(line[++i] ?? '', true);
    } else if (char === '#' && word === null) {
      // An unquoted `#` at the start of a word starts a comment. The newline still ends the command.
      const next = line.indexOf('\n', i);
      i = (next === -1 ? line.length : next) - 1;
    } else if (char === ' ' || char === '\t') {
      endWord();
    } else if (char === '\n') {
      endCommand();
      i = skipHeredocBodies(line, i + 1, heredocs.splice(0), nested) - 1;
    } else if (char === '<' && line[i + 1] === '<' && line[i + 2] !== '<') {
      endWord();
      const match = /^<<-?\s*([^\s;&|<>()]+)/.exec(line.slice(i));
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
          /\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(ownLine);
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
      if (line[i + 1] === op || (op === '>' && line[i + 1] === '|'))
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
    } else if (';&|()'.includes(char)) {
      endCommand();
    } else {
      add(char, false);
    }
  }
  endCommand();
  return commands.filter((words) => words.length > 0);
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
      if (char === quote) quote = '';
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

function collectSubstitutions(text, nested) {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '`' || (text[i] === '$' && text[i + 1] === '(')) {
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
    if (/^\w+=/.test(rest[0]) || SHELL_KEYWORDS.has(rest[0])) {
      rest = rest.slice(1);
    } else if (WRAPPERS.has(name)) {
      rest = skipOptions(rest.slice(1), new Set(WRAPPERS.get(name))).slice(
        WRAPPER_ARGS.get(name) ?? 0,
      );
    } else {
      break;
    }
  }
  return rest;
}

function commandName(word = '') {
  return word.split('/').pop() ?? '';
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
  if (LAUNCHERS.has(name)) return skipOptions(words.slice(1));
  if (name === 'node') {
    const script = skipOptions(words.slice(1));
    return FIXERS.has(commandName(script[0])) ? script : null;
  }
  if (!PACKAGE_MANAGERS.has(name)) return null;
  const script = scriptName(words);
  const at = words.indexOf(script);
  if (['exec', 'dlx', 'x'].includes(script))
    return skipOptions(words.slice(at + 1));
  // `pnpm jest` or `pnpm oxfmt src` run the binary when no script has that name.
  return RUNNERS.has(script) || FIXERS.has(script) ? words.slice(at) : null;
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
  }
  if (
    TERRAFORMS.has(name) &&
    words.slice(1).some((word) => TERRAFORM_BLOCKED.has(word))
  )
    return NO_DEPLOY;
  if (name === 'docker' && (words.includes('push') || words.includes('--push')))
    return NO_DEPLOY;
  if (name === 'gcloud' && words.some((word) => GCLOUD_WRITES.has(word)))
    return NO_DEPLOY;
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
  return [projectDir, ...cdTargets].some((base) => {
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
  return word
    .replace(/^~(?=\/|$)/, homedir())
    .replace(
      /\$\{?(HOME|TMPDIR)\}?/g,
      (whole, name) => process.env[name] ?? whole,
    );
}

/** The path inside the project (`''` is the root), or null when it is outside. Symlinks are followed. */
function projectPath(filePath) {
  const rel = relative(projectDir, realPathOf(resolve(projectDir, filePath)))
    .split('\\')
    .join('/');
  return rel === '..' || rel.startsWith('../') || isAbsolute(rel) ? null : rel;
}

/** Resolves symlinks in the part of the path that exists, so a link from test/ into src/ is caught. */
function realPathOf(path) {
  const missing = [];
  let current = path;
  for (;;) {
    try {
      return join(realpathSync(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return path;
      missing.push(basename(current));
      current = parent;
    }
  }
}
