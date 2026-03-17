# Contributing Guide

This document defines working rules and quality standards for contributors who want to improve this NestJS template.

## 1) General Principles

- Since this repository is a **template**, the goal of changes is to provide a foundation that works with minimal effort when copied to new projects, and is understandable and maintainable.
- Backward compatibility should be preserved as much as possible. Breaking changes must be clearly stated.
- Security and privacy are priorities. Real keys/passwords/secrets must never be added to the repository.

## 2) Branch Policy

- **Direct push to `main` branch is prohibited.**
- All changes are made via **feature branches** and merged to `main` via **Pull Request (PR)**.
- Branch naming suggestion:
  - `feature/<short-description>`
  - `fix/<short-description>`
  - `chore/<short-description>`
  - `docs/<short-description>`

## 3) Issue and PR Process

- Opening an **Issue** before major changes is recommended.
- PRs should be small and focused when possible.
- PRs must include the following information:
  - Purpose of the change
  - Scope (which modules/files are affected)
  - Checks run (lint/test)
  - Migration impact if any
  - Breaking change description if any

## 4) Coding Standards

- The project must follow **TypeScript** and **NestJS** best practices.
- Code style:
  - Prettier is used for formatting.
  - ESLint rules are accepted as valid for linting.
- Naming:
  - Modules `*.module.ts`, services `*.service.ts`, controllers `*.controller.ts`.
- Separation of concerns:
  - Controllers should be kept thin; business rules belong in the service layer.
  - Common structures should be grouped under `src/common`.

## 5) Required Checks

Before opening a PR, ensure the following commands run successfully:

```bash
pnpm lint
pnpm test
```

Additionally, depending on the change:

```bash
pnpm test:e2e
```

## 6) Commit Messages

For consistency in commit messages, the following format is recommended:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
- `refactor: ...`
- `test: ...`

Example:

- `feat: add healthcheck endpoint`
- `fix: handle redis connection errors`

## 7) Configuration and Secret Management

- The `.env` file must not be added to the repository.
- `.env.example` must be kept up to date.
- When adding a new environment variable:
  - Add an example value to `.env.example`,
  - Add validation rule to the `src/config/env.validation.ts` schema.

## 8) Database and Migration

- Schema changes must follow the Drizzle structure.
- If migration is required, it must be mentioned in the PR description.

## 9) Security

- Sensitive data such as tokens/passwords/OTP must not be logged.
- Auth-related changes must consider edge-case scenarios (timeout, token refresh, rate limit).

## 10) Review and Approval

- PRs must be reviewed by at least one reviewer.
- PRs must not be merged until reviewer feedback is addressed.

Thank you. Contributions that follow these rules help the template mature faster.
