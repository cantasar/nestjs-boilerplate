# AGENTS.md

Operating guide for coding agents working in this NestJS boilerplate. **Pairs with [`CLAUDE.md`](CLAUDE.md)** — that file owns architecture, structure, the response envelope, error policy, and SoC rules. This file owns *how to operate*: commands, navigation, and workflow. Read `CLAUDE.md` for the "what/why"; read this for the "how".

## Environment

- **Node 24, pnpm only.** Never invoke `npm` or `yarn`. The `packageManager` field pins the pnpm version.
- Install: `pnpm install`.

## Commands

| Task | Command |
|------|---------|
| Build (must pass before you finish) | `pnpm build` |
| Run dev server | `pnpm start:dev` |
| Lint (autofix) | `pnpm lint` |
| Lint (check only, CI mode) | `pnpm lint:check` |
| Format | `pnpm format` |
| Format check | `pnpm format:check` |
| Unit tests | `pnpm test` |
| Single spec | `pnpm test -- <path-or-pattern>` |
| Coverage | `pnpm test:cov` |
| E2E tests | `pnpm test:e2e` |
| Generate API docs | `pnpm docs:generate` |

**Definition of done for any code change:** `pnpm build` is clean and any new/affected `*.spec.ts` pass. Lint and format are enforced by Husky + lint-staged on commit, but run `pnpm lint` yourself before declaring done.

### Database commands — do NOT run unprompted

`db:generate`, `db:migrate`, `db:push`, `db:pull`, `db:studio` exist but are **out of band**. Edit the Drizzle schema as part of a feature, but do not run migrations unless the user explicitly asks — they decide when migrations are generated/applied.

## Repository navigation

- Source lives under `src/modules/`, grouped: `shared/`, `platform/`, `user/`, `admin/`, `_template/`. See `CLAUDE.md §5` before placing a file.
- To learn a feature's shape, read `src/modules/_template/todo/` — the canonical controller → service → repository → dto layout.
- Root wiring is in `src/app.module.ts` (modules + global guards) and `src/main.ts` (bootstrap). Routing/versioning is centralized in `src/modules/shared/common/config/app-versioning.ts`.
- Env contract: `src/modules/shared/common/config/env.schema.ts` / `env.validation.ts` (Zod-validated at boot). Check here before adding a config var; `.env.example` documents the surface.
- No path aliases — imports are relative.

### Before changing code

1. Read the target feature folder and its `*.spec.ts`.
2. Check `CLAUDE.md` for the relevant rule (envelope §8, error/status §9, SoC §10).
3. Make the surgical change; add/adjust specs; run `pnpm build` + `pnpm test`.

## Swap points (where to change an external dependency)

When asked to change a vendor/integration, edit the implementation **behind the abstraction** and keep its public signature — callers must not change. Detail and the full table are in `CLAUDE.md §7`. Quick map:

- Database → `shared/database/database.module.ts` (`DATABASE_TOKENS.DRIZZLE`).
- Cache → `shared/redis/redis.service.ts` (`REDIS_CLIENT`).
- Mail → `platform/mail/mail.service.ts`.
- Auth → `platform/auth/` (strategy + `AuthService`).

If you find yourself importing a vendor SDK type outside its `platform/<concern>` service, stop — that leak is the bug.

## Commit & branch discipline

- **Conventional Commits:** `feat(scope): subject`, `fix(scope): subject`, `docs(scope): subject`, etc. Scope is the feature/group (`feat(auth): ...`, `fix(database): ...`). Subject is imperative, lowercase, no trailing period. Enforced by commitlint.
- **Never merge directly into a shared branch** (`main`, `development`, release branches). Resolve conflicts on the feature branch and stop; wait for explicit approval before touching shared branches.
- Only commit/push when the user asks. If automation drives the change, leave commits to the orchestrator — make file edits only.
- Keep diffs surgical (`CLAUDE.md §3`): every changed line traces to the request.

## Conventions agents get wrong here

- This is an **English-only** codebase — no i18n layer (`CLAUDE.md`).
- Services **throw** typed exceptions; they never build the response envelope. The interceptor wraps success, the global filter wraps errors (`CLAUDE.md §8–9`).
- `400` = parse/validation failure; `422` = business-rule violation. Don't conflate them.
- One exported class per DTO file; extracted types go to `interfaces/*.types.ts`; constants to `*.constants.ts` (`CLAUDE.md §10`).
- Never add real logic to `_template/` and never depend on it from production modules.
