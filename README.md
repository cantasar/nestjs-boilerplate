# NestJS Boilerplate

A small, production-ready NestJS API to start new backends from. It ships auth, roles, mail, queues, webhooks, health checks and Swagger. Everything else you add per project.

**Stack:** NestJS 12 · TypeScript 6 · Drizzle ORM + PostgreSQL · Redis · BullMQ · Zod · Pino · Swagger · Node 26 · pnpm

## Quick start

Needs Node 26.12.1 or newer (`nvm use` picks the version in `.nvmrc`; older 26.x has known security bugs, fixed in the 26.12.1 security release), pnpm (`npm install -g pnpm`; it switches to the version in `package.json` by itself) and Docker.

```bash
pnpm install
cp .env.example .env      # then fill in your values
docker compose up -d      # local PostgreSQL + Redis
pnpm db:push              # create the tables in the local DB
pnpm start:dev            # http://localhost:3000
```

Swagger: http://localhost:3000/api/v1/docs (mobile view: `/api/v1/mobile/docs`).

## What is inside

| Feature | What it does | Where |
|---|---|---|
| Auth | Email + password (register, login, email verification, forgot/reset/change password, logout), Google and Apple sign-in, JWT access + rotating refresh tokens | `platform/auth` |
| Guards | Every route needs a JWT unless `@Public()`. `@Roles(UserRole.ADMIN)` for admin routes. `@ApiKeyAuth()` for server-to-server routes | `shared/common/guards` |
| Rate limits | 100 requests/min per IP everywhere, 5/min on login, register and password routes | `app.module.ts`, `auth/decorators` |
| Mail | Queued emails (ZeptoMail) with HTML templates. Skipped with a warning until configured | `platform/mail` |
| Webhooks | Signed (HMAC) outgoing webhooks with retries. Import `WebhookDeliveryModule` in the feature that needs it | `platform/webhooks` |
| Queue | BullMQ on Redis, shared by mail and webhooks | `platform/queue` |
| First admin | Creates an admin on startup from `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` | `platform/seeds` |
| Health | `GET /health` (alive), `GET /health/ready` (DB + Redis) | `platform/health` |
| Errors | One error format with stable codes, one file per enum | `shared/common/errors` |
| Example | Full CRUD feature to copy from | `_template/todo` |

### Response format

Every `/api/v1` response uses one envelope. The HTTP status is the truth; `success` repeats it.

```jsonc
{ "success": true, "data": { }, "meta": { } }                                  // 2xx (a 204 has no body)
{ "success": false, "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "...", "details": [] } }
```

Clients should branch on `error.code`, never on `message`.

### Auth endpoints (`/api/v1/auth`)

| Method | Path | Access |
|---|---|---|
| POST | `register`, `login`, `google`, `apple` | Public, 5/min |
| POST | `register/verify-email`, `register/verify-email/resend` | Public, 5/min |
| POST | `forgot-password`, `reset-password` | Public, 5/min |
| POST | `refresh` | Public |
| PATCH | `change-password` | Logged in, 5/min |
| POST | `logout` | Logged in |

Email codes (verify and reset) allow 5 tries per code. After 10 wrong codes or 10 code mails in one day, that email waits up to 24 hours. Auth errors use `AUTH_*` codes, for example `AUTH_INVALID_CODE` or `AUTH_WRONG_PASSWORD`.

## Project structure

```
src/
├── main.ts                 bootstrap: helmet, CORS, validation, Swagger
├── app.module.ts           modules + global guards
├── swagger/                Swagger setup
└── modules/
    ├── shared/             common (config, errors, guards, decorators), database, redis
    ├── platform/           auth, mail, queue, webhooks, health, internal, seeds
    └── _template/todo/     copy this to start a new feature
infra/                      Terraform for GCP (infra/gcp) or AWS (infra/aws), see infra/README.md
.claude/                    Claude Code setup (see below)
```

**New feature:** copy `src/modules/_template/todo` into `src/modules/user/<name>` or `admin/<name>`, rename it, add its table in `src/modules/shared/database/schema/`, and import the module in `app.module.ts`. Code rules: [`.claude/rules/nestjs.md`](.claude/rules/nestjs.md).

## Environment variables

All of them are listed with short notes in [`.env.example`](.env.example) and checked at boot by [`env.schema.ts`](src/modules/shared/common/config/env.schema.ts). The app does not start with an invalid value. In production `JWT_SECRET` must be a random value of 32+ characters.

## Scripts

| Command | What it does |
|---|---|
| `pnpm start:dev` | Dev server with watch |
| `pnpm build` / `pnpm start:prod` | Build / run the build |
| `pnpm lint` / `pnpm lint:check` | Oxlint (fix / check) + project rules ([`scripts/check-rules.mjs`](scripts/check-rules.mjs)) |
| `pnpm format` / `pnpm format:check` | Oxfmt |
| `pnpm test` / `pnpm test:e2e` / `pnpm test:cov` | Jest unit / e2e (needs `docker compose up -d`) / coverage |
| `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle migrations and tools |

**Project rules** (`pnpm lint:check`): one class per `*.dto.ts`, one enum per file in an `enums/` folder, no `any`, no `as unknown as`, no `as never`, no `Promise<any|unknown>`, no database access in a `*.service.ts`.

## Git and CI

- Commit messages follow Conventional Commits (`feat(auth): add apple login`), checked by commitlint. No AI credit lines (`Co-Authored-By: Claude ...`) in commits or PRs; the local commit-msg hook (`scripts/check-commit-msg.mjs`) rejects them in commit messages.
- Pre-commit: lint + format on staged files and a gitleaks secret scan. Pre-push: lint, format check and build.
- CI (GitHub Actions): secret scan, lint, format check, build and unit tests, plus e2e tests with Postgres and Redis, on every PR.
- Work on a branch and merge through a PR. Migrations are generated at merge or release time, not on feature branches.

## Deploy

Terraform builds the infra on GCP (Cloud Run) or AWS (ECS Fargate). A manual GitHub **Deploy** workflow ships new versions.

Deploy is **off by default**, so a fresh copy never deploys. Turn it on by setting the repository variable `DEPLOY_TARGET` to `gcp` or `aws`. Steps: [`infra/README.md`](infra/README.md).

## Working with Claude Code

This repo has a Claude Code setup that follows the team rules.

**Start here:** in a new project, run `/project-setup` before anything else. While `Project info` in `CLAUDE.md` says NOT SET, Claude asks you to run it first.

| File | What it does |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Main rules Claude reads every session: project info, hard rules, task flow, MD folders |
| `.claude/settings.json` | Blocks commit/push, deploy commands and secret files (`.env`, `*.tfvars`, keys) |
| `.claude/hooks/guard.mjs` | Blocks env and secret files, commit/push/deploy commands, secret managers (doppler, op, infisical, dotenv), tests or app starts outside the tester session, and tester writes to app code |
| `.claude/agents/tester.md` | The **tester** session: writes and runs all tests, reviews the code, logs runs, writes corrections, ends each round with a coder prompt |
| `.claude/rules/` | Code rules (load when Claude touches `src/`, `test/` or `infra/`) |
| `.claude/skills/` | Slash commands (below) |
| `.claude/templates/` | MD templates for tasks, messages, logs and changelogs |

**Task flow:** each task runs with two sessions, one coder and one tester. Keep both open for the whole task.

```bash
claude
```

```bash
claude --agent tester
```

The coder ends with a **tester prompt**. Paste it into the tester session. The tester ends with a **coder prompt** (fixes, or PASS → `/task-done`). Paste it back. Repeat until PASS. Formats are in `CLAUDE.md` → How a task runs.

The guard fails closed: if it cannot run (for example `node` is not on your PATH), Claude's tool calls are blocked until you fix it. It needs Claude Code 2.1.295 or newer.

**Slash commands:**
- `/project-setup`: first run on a new project or a new clone. Asks the project questions and creates the MD folders.
- `/task-done`: closes a task. Changelog, file moves, branch check and the final report.
- `/compare-branches`: before you commit, checks other devs' branches for overlaps and conflicts.
- `/message <team> <topic>`: writes a message MD for frontend, backend, flutter or design, or handles the inbox.

**Backend only:** this scaffold is for the backend. `communication/frontend/`, `flutter/` and `design/` hold MD messages to those teams, not their code. Claude does not offer to build frontend, Flutter or design code; ask it directly if you really want that.

**MD folders** (`docs/`, `tasks/`, `communication/`) stay on your machine (gitignored). `internal/INTERNAL_CHANGELOG.md` is committed and shared by the backend devs. Personal Claude settings go in `.claude/settings.local.json` (gitignored).

> [!WARNING]
> **Made a project from this template?** The template ships empty `docs/` and `communication/` folders, so git still tracks them even though `.gitignore` lists them. Run this once in your new project and commit, or your plans and team messages can end up in git:
>
> ```bash
> git rm -r --cached docs communication
> ```
>
> `/project-setup` reminds you about this.

## Known limits

- **Rate limits behind the HTTPS load balancer.** The auth limit is 5 tries per minute per IP. With `enable_lb = true`, the app may see the load balancer's IP for every user (`trust proxy` is 1 in `src/main.ts`). Then all users share one limit. Check `req.ip` on a test deploy before you turn the load balancer on. The default deploy has no load balancer and is fine.
- **The guard is a safety net, not a sandbox.** A few odd hand-made shell commands can get past `.claude/hooks/guard.mjs` (for example turning on `shopt -s dotglob` first, so a plain `*` reaches hidden folders). Claude does not write these by accident. Where the guard cannot read a command, it blocks it: code piped into a shell, a variable or glob as the command name, unusual heredoc delimiters.
- **Swagger** does not list `AUTH_PROVIDER_DISABLED` on the Google and Apple routes, or `AUTH_SOCIAL_ACCOUNT` on change-password. The API returns them as 400.
