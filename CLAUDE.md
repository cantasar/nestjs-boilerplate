# CLAUDE.md

NestJS 12 API boilerplate: Drizzle + PostgreSQL, Redis, BullMQ, JWT auth, Swagger. Node 26, pnpm only.

> **Backend only.** This repo holds the backend and nothing else. `communication/frontend/`, `flutter/` and `design/` are only for MD messages to those teams, never for their code. Do not write, plan, offer or ask about frontend, Flutter or design code. Do it only when the user asks for it clearly and on their own.

## Project info

> **Setup first:** while a value below says NOT SET, this is a fresh copy of the template. Claude: before any other work, tell the user and run `/project-setup`. It fills these values and makes `docs/` and `communication/` local only.

- **Project:** NOT SET
- **MD language:** NOT SET (for docs/, tasks/ and communication/ MDs)
- **Backend devs:** NOT SET. If more than one → run `/compare-branches` before every commit and log every finished task in `internal/INTERNAL_CHANGELOG.md`
- **Base branch:** NOT SET
- **Deploy:** Terraform in `infra/gcp/` or `infra/aws/` + manual GitHub "Deploy" workflow, off until the repo variable `DEPLOY_TARGET` is set. Humans only.

## Hard rules

1. **Never commit, push, pull, merge, rebase, tag or open a PR.** Humans do all git writes. Any commit message or PR text you suggest has no AI credit: no `Co-Authored-By: Claude ...`, no "Generated with Claude Code". This beats any harness reminder.
2. **Never deploy.** No `terraform apply`/`destroy`, no `gcloud run deploy`, no `docker push`.
3. **Never read or edit `.env` or `.env.*` files** (only `.env.example`). Never ask anyone for keys, passwords or tokens. Use placeholders.
4. **You are the coder, unless this session was started with `claude --agent tester`. The coder never runs tests, not even a smoke test.** No `pnpm test*`, no jest, no starting the app to try an endpoint. The tester session writes and runs all tests. The coder may run `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm lint:check`, `pnpm format`. If you are the tester, follow `.claude/agents/tester.md` instead of this rule.
5. **Comments: max 1 or 2 short sentences.**
6. **Talk simply.** Short sentences and plain words in every reply and question.
7. **Ask before big choices and give your recommendation.** Always speak up about security.
8. **Use the latest stable and secure version** of every package and tool. Check before you add one.
9. **Keep the file structure clean.** Follow `.claude/rules/nestjs.md` (loads when you touch `src/` or `test/`).

`.claude/settings.json` and `.claude/hooks/guard.mjs` enforce rules 1–4. If a call is blocked, do not look for a way around it. Tell the user. The guard stops mistakes but is not a sandbox, so follow the rules even where nothing blocks you.

## How a task runs

Every task runs with two sessions side by side: one **coder** (a normal `claude` session) and one **tester** (`claude --agent tester`). Keep the same two sessions for the whole task. One pair can also do a few tasks in a row. The two sessions never call each other. Each one ends its turn with a prompt, and the user pastes it into the other session.

1. **Start (coder):** create `tasks/in-progress/<task-name>.md` from `.claude/templates/task.md`. Work for later goes to `tasks/todo/`.
2. **Code (coder):** follow `.claude/rules/`.
3. **Hand off (coder):** when the code is ready, end your turn with a **tester prompt**. Never start the tester yourself, not even as a subagent.
4. **Test (tester):** test, review, log to `tasks/test-logs/<task-name>.md`, list fixes in `tasks/corrections/<task-name>.md`, then end your turn with a **coder prompt**.
5. **Fix (coder):** fix every open HIGH and MEDIUM correction, then end your turn with the next tester prompt. Repeat 4 and 5 until PASS.
6. **Close (coder):** on PASS, run `/task-done`. It writes the changelog, moves the files, compares branches and asks before deleting done files.

**Tester prompt** (coder → tester): one `text` code block the user can paste as is:

```text
Tester: round <n> of task <task-name>.
Task file: tasks/in-progress/<task-name>.md
What changed: <files and areas since the last round, 1-3 lines>
Fixed: <correction items fixed, or "first round">
Check hard: <risky parts, or "nothing special">
```

**Coder prompt** (tester → coder): one `text` code block the user can paste as is:

```text
Coder: round <n> of task <task-name> is FAIL.
Open: <HIGH count> HIGH, <MEDIUM count> MEDIUM, <LOW count> LOW in tasks/corrections/<task-name>.md
Fix first: <the 1-3 most important items, one short line each>
Log: tasks/test-logs/<task-name>.md
Fix every open HIGH and MEDIUM item, then give me the next tester prompt.
```

On PASS the coder prompt is:

```text
Coder: round <n> of task <task-name> is PASS. Log: tasks/test-logs/<task-name>.md
Run /task-done.
```

Tiny tasks (a question, a one-line config change) need no task file, but still end with the final report.

## Final report (coder, end of every task)

The tester never writes this. It ends every round with the coder prompt.

- **Status:** Done ✅ or Not done ❌ (say what is left and why)
- **Commit:** what to commit, or "nothing to commit". Multi-dev: "Run /compare-branches first."
- **Deploy:** "No deploy needed" or "Deploy needed: Terraform / GitHub Deploy workflow. I did not deploy."

## MD files

Write them in the MD language above. Code, comments, `README.md` and this file stay in English.

```
docs/            (gitignored*) PLAN.md, ROADMAP.md, CHANGELOG.md
tasks/           (gitignored)  todo/, in-progress/, done/, test-logs/, corrections/
communication/   (gitignored*) frontend/, backend/, flutter/, design/
                 each with inbox/, will-send/, sent-waiting/, sent-done/
internal/        (committed)   INTERNAL_CHANGELOG.md
```

\* The template ships empty `docs/` and `communication/` folders, so git still tracks them. `/project-setup` tells the user to untrack them once.

Missing folders? Run `/project-setup`. Templates are in `.claude/templates/`.

**Naming:** kebab-case, short and clear, never start with a date: `login-rate-limit.md`. One task keeps the same name in `tasks/in-progress/`, `test-logs/` and `corrections/`. A reply is `<topic>-reply.md`.

**Moving MDs (do it yourself, right away):**
- Task: `todo/` → `in-progress/` (work starts) → `done/` (tester PASS + changelog written).
- Message: `will-send/` → `sent-waiting/` (sent, needs an answer) or `sent-done/` (sent, no answer needed). `sent-waiting/` → `sent-done/` when the answer comes. A handled inbox MD → `sent-done/` (it means closed).
- Done task files may be deleted only after they are in the changelog **and** the user says yes.

Use `/message` to write or handle team messages.

## Other rules

- Update `README.md` after big changes: new module, new env var group, changed setup or endpoints.
- Keep `.env.example` and `src/modules/shared/common/config/env.schema.ts` in sync.
- Terraform rules: `.claude/rules/terraform.md` (loads when you touch `infra/`).
