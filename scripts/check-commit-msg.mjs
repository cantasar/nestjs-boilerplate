#!/usr/bin/env node
// Rejects AI credit lines in a commit message. Runs outside commitlint, so merge/revert/fixup/squash commits are checked too.
// Usage: `node scripts/check-commit-msg.mjs <commit-msg-file>`.
import { readFileSync } from 'node:fs';

const AI_CREDIT = [
  // Only the AI forms: "Claude", "Claude Opus 5.5", "Claude Code", or the Anthropic noreply email.
  /^\s*co-authored-by:\s*claude(\s+(opus|sonnet|haiku|code)\b[^<\n]*)?\s*</im,
  /^\s*co-authored-by:.*<noreply@anthropic\.com>/im,
  // The robot footer, with an optional emoji or symbol first.
  /^[^\w\n]*generated with \[?claude code/im,
];

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/check-commit-msg.mjs <commit-msg-file>');
  process.exit(2);
}

// Keep only what git saves: drop the `git commit -v` diff below the scissors line and `#` comment lines.
const message = readFileSync(file, 'utf8')
  .split(/^.*-{24} >8 -{24}.*$/m)[0]
  .split(/\r?\n/)
  .filter((line) => !line.startsWith('#'))
  .join('\n');

if (AI_CREDIT.some((re) => re.test(message))) {
  console.error(
    'Commit message has an AI credit line (Co-Authored-By: Claude / Generated with Claude Code). Remove it.',
  );
  process.exit(1);
}
