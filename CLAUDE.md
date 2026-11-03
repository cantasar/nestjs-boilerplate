# CLAUDE.md

NestJS 12 API boilerplate: Drizzle + PostgreSQL, Redis, BullMQ, JWT auth, Swagger. Node 26, pnpm only.

> **Backend only.** This repo holds the backend and nothing else. `communication/frontend/`, `flutter/` and `design/` are only for MD messages to those teams, never for their code. Do not write, plan, offer or ask about frontend, Flutter or design code. Do it only when the user asks for it clearly and on their own.

## Project info

> **Setup first:** while a value below says NOT SET, this is a fresh copy of the template. Claude: before any other work, tell the user and run `/project-setup`. It fills these values and makes `docs/` and `communication/` local only.

- **Project:** NOT SET
- **MD language:** NOT SET (for docs/, tasks/ and communication/ MDs)
- **Backend devs:** NOT SET. If more than one → run `/compare-branches` before every commit and log every finished task in `internal/INTERNAL_CHANGELOG.md`
- **Base branch:** NOT SET
- **Deploy:** Terraform in `infra/` + manual GitHub "Deploy" workflow. Humans only.

## Hard rules

1. **Never commit, push, pull, merge, rebase, tag or open a PR.** Humans do all git writes.
2. **Never deploy.** No `terraform apply`/`destroy`, no `gcloud run deploy`, no `docker push`.
3. **Never read or edit `.env` or `.env.*` files** (only `.env.example`). Never ask anyone for keys, passwords or tokens. Use placeholders.
4. **You are the coder agent. Never run tests, not even a smoke test.** No `pnpm test*`, no jest, no starting the app to try an endpoint. The `tester` agent writes and runs all tests. You may run `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm lint:check`, `pnpm format`.
5. **Comments: max 1 or 2 short sentences.**
6. **Talk simply.** Short sentences and plain words in every reply and question.
7. **Ask before big choices and give your recommendation.** Always speak up about security.
8. **Use the latest stable and secure version** of every package and tool. Check before you add one.
9. **Keep the file structure clean.** Follow `.claude/rules/nestjs.md` (loads when you touch `src/` or `test/`).

`.claude/settings.json` and `.claude/hooks/guard.mjs` enforce rules 1–4. If a call is blocked, do not look for a way around it. Tell the user. The guard stops mistakes but is not a sandbox, so follow the rules even where nothing blocks you.

## How a task runs

1. **Start:** create `tasks/in-progress/<task-name>.md` from `.claude/templates/task.md`. Work for later goes to `tasks/todo/`.
2. **Code:** follow `.claude/rules/`.
3. **Test:** when the code is ready, run the **tester** agent with the task name and what changed. It writes and runs the tests, reviews your code, logs to `tasks/test-logs/<task-name>.md` and lists fixes in `tasks/corrections/<task-name>.md`.
4. **Fix:** fix every open HIGH and MEDIUM correction, then run the tester again. Repeat until PASS.
5. **Close:** run `/task-done`. It writes the changelog, moves the files, compares branches and asks before deleting done files.

Tiny tasks (a question, a one-line config change) need no task file, but still end with the final report.

## Final report (end of every task)

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
