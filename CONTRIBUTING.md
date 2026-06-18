# Contributing Guide

Working rules and quality standards for contributors. This is a **template**: changes should keep the foundation easy to clone, fill in, and maintain. Architecture and conventions live in [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md); the day-to-day dev flow is in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## General principles

- Preserve backward compatibility where possible; state breaking changes clearly.
- Never commit real keys, passwords, or secrets. `.env` is git-ignored; keep `.env.example` current.
- Keep changes small and focused. Every changed line should trace to the stated purpose.

## Branch & merge etiquette

- All changes go through **feature branches** and merge via Pull Request — no direct pushes to shared branches.
- Suggested naming: `feat/<desc>`, `fix/<desc>`, `chore/<desc>`, `docs/<desc>`.
- Don't run database migration commands on feature branches; migrations are decided at merge/deploy time.
- A PR should describe its purpose, scope (modules/files touched), checks run, migration impact, and any breaking change.

## Commit messages — Conventional Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are validated by a **commitlint `commit-msg` hook** (`@commitlint/config-conventional`). Use `type(scope): subject`:

```
feat(auth): add phone OTP login
fix(notifications): handle empty broadcast batch
docs(readme): refresh ports table
```

Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`.

## Coding standards & SoC

- Follow TypeScript / NestJS best practices; Oxfmt formats and Oxlint lints.
- Naming: `*.module.ts`, `*.service.ts`, `*.controller.ts`, `*.repository.ts`, `*.dto.ts`.
- **Separation of concerns:** controllers thin, business logic in services, persistence in repositories, pure entity→DTO mapping in `mappers/`. Place code in the matching `src/modules/<group>/` per [CLAUDE.md §5](CLAUDE.md).
- **One DTO per file** — at most one exported class per `*.dto.ts` (enforced).
- Reach external dependencies through their **port**, never the vendor SDK directly.

### TypeScript discipline guards

In addition to Oxlint, four guards run via `pnpm lint:check` and the `lint-staged` pre-commit hook:

| Guard | Rule |
|-------|------|
| `lint:no-double-cast` | No `as unknown as` in production code (specs may use it for mocks) |
| `lint:no-prod-never` | No `as never` cast — use literal union types |
| `lint:no-untyped-promise` | No floating/untyped promises; mark intentional ones with `// void-ok` |
| `lint:no-multi-class-dto` | One exported class per `*.dto.ts` |

## Required checks

Before opening a PR, ensure these pass:

```bash
pnpm build
pnpm lint:check
pnpm format:check
pnpm test
```

Run `pnpm test:e2e` when the change affects request/response behavior. Lint and format are also enforced on commit by Husky + lint-staged, but run them yourself first.

## Configuration & secrets

When adding an environment variable:

- Add a documented example to `.env.example`.
- Add the validation rule to the Zod schema in `src/modules/shared/common/config/env.schema.ts` (wired through `env.validation.ts`).
- Make integrations conditional/feature-flagged where possible, so the boilerplate boots without them.

## Database & migrations

- Schema changes follow the Drizzle structure under `shared/database/schema/`.
- Migration files are not committed; if a change needs one, note it in the PR and generate it at merge/deploy time (`pnpm db:generate`).

## Security

- Never log sensitive data (tokens, passwords, OTPs).
- Auth changes must consider edge cases: token refresh, expiry, rate limiting, fail-closed guard behavior.

## Review

- At least one reviewer approves before merge.
- Don't merge until feedback is addressed.

Thank you — changes that follow these rules keep the template healthy.
