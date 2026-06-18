# NestJS Boilerplate

A production-grade, domain-agnostic NestJS platform template. It ships the cross-cutting machinery a real backend needs — auth, RBAC, audit, queues, storage, SMS, mail, push notifications, media, consent, legal documents — built on a **clone-and-fill** model: every domain-specific touch point (vendors, roles, audited entities, document types) sits behind an injection-token **port** or a **placeholder enum** you replace. Start a new service by cloning this repo, swapping the placeholders, and adding your domain modules.

## Requirements

- **Node 24+** (see [`.nvmrc`](.nvmrc); `nvm use`)
- **pnpm 9+** (enable via `corepack enable`; never `npm`/`yarn` — the `packageManager` field pins the version)
- **PostgreSQL** (16 recommended)
- **Redis** (7 recommended)

## Quick start

```bash
corepack enable                 # provisions the pinned pnpm
pnpm install
cp .env.example .env            # fill in JWT_SECRET and anything you enable

docker compose up -d            # local PostgreSQL 16 + Redis 7
pnpm db:generate                # generate SQL migrations from the Drizzle schema
pnpm db:push                    # push schema to the dev DB (or `pnpm db:migrate`)
pnpm start:dev                  # watch mode on http://localhost:3000
```

> **Migrations are not shipped.** The `drizzle/` folder has no migration files until you run `pnpm db:generate`. For local iteration use `pnpm db:push` (no migration files); generate proper migrations at merge/deploy time.

## Project structure

All feature code lives under `src/modules/`, grouped by domain. See [CLAUDE.md](CLAUDE.md) for the full layout rules and per-feature conventions.

```
src/
├── app.module.ts                  # root wiring: global guards, interceptors, module imports
├── main.ts                        # bootstrap: helmet, CORS, body parser, versioning, swagger
├── swagger/                       # OpenAPI setup (not a NestJS module)
└── modules/
    ├── shared/                    # cross-cutting infra
    │   ├── common/                # filters, guards, interceptors, decorators, validators, config, audit
    │   ├── database/              # Drizzle schema, repositories, DatabaseModule
    │   └── redis/                 # ioredis client + throttler storage
    ├── platform/                  # platform-level transports / infra-as-feature
    │   ├── auth/                  # JWT + refresh rotation, OAuth, email/phone OTP, password reset
    │   ├── mail/                  # mail service + queued delivery + templates
    │   ├── sms/                   # SMS sender port + queued delivery
    │   ├── storage/               # storage port + GCS adapter + media-cleanup sweep
    │   ├── media/                 # media asset port + variant processing queue
    │   ├── notifications/         # notification port + OneSignal push + broadcast fanout + inbox
    │   ├── queue/                 # BullMQ base wiring + example queue
    │   ├── events/                # EventEmitter wiring + example listener
    │   └── health/                # /health, /health/ready
    ├── user/                      # end-user-facing features
    │   ├── consent/               # consent capture (DOCUMENT_STORE port)
    │   └── legal-documents/       # public legal-document read API
    ├── admin/                     # admin-panel features
    │   └── bug-reports/           # bug-report intake + triage (+ optional asset attachments)
    └── _template/                 # copy-me reference feature
        └── todo/                  # full CRUD: controller, service, repository, DTOs, specs
```

### Routing & versioning

URI versioning is enabled globally in [`src/main.ts`](src/main.ts): `setGlobalPrefix('api')` + `VersioningType.URI` with default version `1`, so every controller resolves under `/api/v1/...`. `health` (`/health`, `/health/ready`) is version-neutral and excluded from the prefix.

## Features

Each domain-touching feature is reached through a **port** (an injection token with a swappable adapter) so the vendor can change without touching callers.

| Feature | What it provides | Port / swap point |
|---------|------------------|-------------------|
| **Auth** | JWT access + refresh-token rotation, OAuth (Google/Apple), email verification, email/phone OTP login & registration, change-password, logout. Fail-closed global guard — every route requires a valid JWT unless marked `@Public()`. | `platform/auth` (`AuthService` + JWT strategy) |
| **RBAC** | Role-based access via a roles guard reading the placeholder `UserRole` enum. | `shared/common/enums/user-role.enum.ts` |
| **Audit** | `@Audit` decorator captures before/after snapshots for mutating handlers and persists them through a sink. | `AUDIT_SINK` (`shared/common/audit`) |
| **Queue** | BullMQ base module + example queue; mail/SMS/media run on their own queues. | `platform/queue` |
| **Storage** | Object storage with presigned URLs; GCS adapter today, dormant until `GCS_BUCKET` is set. | `STORAGE_SERVICE` (`platform/storage`) |
| **SMS** | Generic code-prefixed HTTP gateway sender; dormant until `SMS_API_URL` is set. | `SMS_SENDER` (`platform/sms`) |
| **Mail** | Queued mail delivery with templates (ZeptoMail today). | `platform/mail/mail.service.ts` |
| **Notifications** | Notification port + OneSignal push + chunked broadcast fanout (via queue) + inbox. | `NOTIFICATION_PORT`, `PUSH_SENDER` (`platform/notifications`) |
| **Media** | Media asset metadata + variant (resize/thumbnail) processing queue. | `ASSET_PORT` (`platform/media`) |
| **Consent + Legal Documents** | Authenticated consent capture + public legal-document read API. | `DOCUMENT_STORE` (`user/consent`) |
| **Bug Reports** | Admin bug-report intake + triage; optional media attachments via `ASSET_PORT`. | `admin/bug-reports` |

### Response envelope (v1)

Every JSON response from a `/api/v1` route is a single uniform envelope. The HTTP status line is the source of truth; the body restates it via `success`.

```jsonc
// success (2xx) — 204 is normalized to 200 + data: null
{ "success": true, "data": <payload>, "meta": { ... } }   // meta optional (pagination/totals)

// error
{ "success": false, "error": { "code": "STRING_CODE", "message": "human readable", "details": [ ... ] } }
```

See [CLAUDE.md §6](CLAUDE.md) for the full contract.

### Auth endpoints

All under `/api/v1/auth`. `@Public` routes need no token; the rest require a valid bearer JWT (global fail-closed guard).

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | `register` | Public | Register; sends an email-verification OTP |
| POST | `register/verify-email` | Public | Verify email OTP and complete login |
| POST | `register/verify-email/resend` | Public | Resend the email-verification OTP |
| POST | `login` | Public | Email + password login |
| POST | `login/email` | Public | Request an email login OTP |
| POST | `login/email/verify` | Public | Verify email OTP and log in |
| POST | `register/phone` | Public | Request a phone-registration OTP |
| POST | `register/phone/verify` | Public | Verify phone OTP and complete registration |
| POST | `login/phone` | Public | Request a phone login OTP |
| POST | `login/phone/verify` | Public | Verify phone OTP and log in |
| POST | `google` | Public | Sign in with a Google ID token |
| POST | `apple` | Public | Sign in with an Apple ID token |
| POST | `forgot-password` | Public | Send a reset code if the account exists |
| POST | `reset-password` | Public | Reset password with the verification code |
| POST | `refresh` | Public | Exchange a refresh token for a new access token |
| PATCH | `change-password` | Authenticated | Change the current user's password |
| POST | `logout` | Authenticated | Invalidate the current refresh token |

## Ports & swap points

When changing a vendor/integration, edit the implementation **behind the abstraction** and keep its public signature — callers must not change. Full table in [CLAUDE.md §7](CLAUDE.md).

| Concern | Token / abstraction | Defined in | Bound in |
|---------|---------------------|------------|----------|
| User persistence | `UserRepository` | `shared/database/repositories/user.repository.ts` | injected directly |
| Audit sink | `AUDIT_SINK` | `shared/common/audit/constants/audit.tokens.ts` | `audit.module.ts` |
| Object storage | `STORAGE_SERVICE` | `platform/storage/interfaces/storage.types.ts` | `storage.module.ts` |
| SMS sender | `SMS_SENDER` | `platform/sms/interfaces/sms-sender.interface.ts` | `sms.module.ts` |
| Push sender | `PUSH_SENDER` | `platform/notifications/interfaces/push-sender.interface.ts` | `notifications.module.ts` |
| Notification port | `NOTIFICATION_PORT` | `platform/notifications/interfaces/notification-port.interface.ts` | `notifications.module.ts` |
| Media asset port | `ASSET_PORT` | `platform/media/interfaces/asset-port.interface.ts` | `media.module.ts` |
| Document store | `DOCUMENT_STORE` | `user/consent/interfaces/document-store.interface.ts` | `consent.module.ts` |

### Placeholder enums to replace

These ship with generic members — swap them for your real domain values:

| Enum | File |
|------|------|
| `UserRole` | `shared/common/enums/user-role.enum.ts` |
| `BugStatus`, `BugSeverity` | `admin/bug-reports/enums/` |
| `ConsentStatus` | `shared/database/schema/enums/consent-status.enum.ts` |
| `DocumentType` | `shared/database/schema/enums/document-type.enum.ts` |
| `AuditAction`, `AuditEntity` | `shared/common/audit/enums/` |

## API docs

Swagger is served outside production by default (set `SWAGGER_ENABLED=true` to expose it in production; `false` disables it elsewhere). Two views are mounted:

- **Full API docs:** `http://localhost:3000/api/v1/docs`
- **Mobile API docs** (user-facing tags only): `http://localhost:3000/api/v1/mobile/docs`
- **OpenAPI JSON:** `http://localhost:3000/api/v1/docs/openapi.json`

Both can be protected with HTTP Basic Auth (`SWAGGER_BASIC_AUTH_USER` / `_PASSWORD`). Generate a static OpenAPI artifact with `pnpm docs:generate`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Compile with `nest build` |
| `pnpm start:dev` | Watch-mode dev server |
| `pnpm start:prod` | Run compiled `dist/main.js` |
| `pnpm lint` | Oxlint with autofix |
| `pnpm lint:check` | Oxlint (no fix) **plus** the four discipline guards below |
| `pnpm format` / `pnpm format:check` | Oxfmt write / check |
| `pnpm test` / `pnpm test:cov` / `pnpm test:e2e` | Jest unit / coverage / e2e |
| `pnpm db:generate` | Generate SQL migrations from the Drizzle schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:push` | Push schema to the DB without migration files (dev) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm docs:generate` | Emit a static OpenAPI document |

**Custom lint guards** (run by `lint:check` and `lint-staged`):

| Guard | Enforces |
|-------|----------|
| `lint:no-double-cast` | No `as unknown as` double-cast in production code (specs may use it for mocks) |
| `lint:no-prod-never` | No `as never` cast in production code |
| `lint:no-untyped-promise` | Floating/untyped promises are rejected (annotate intentional ones with a `// void-ok` comment) |
| `lint:no-multi-class-dto` | At most one exported class per `*.dto.ts` (one DTO per file) |

Commit messages follow **Conventional Commits**, enforced by a commitlint `commit-msg` hook.

## Environment variables

`.env.example` documents every variable with inline notes. Many groups are **conditional** — a feature stays dormant until its flag variable is set. Required vs conditional, grouped:

| Group | Key vars | Required? |
|-------|----------|-----------|
| Core | `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `BODY_PARSER_LIMIT` | defaults provided |
| Database | `DATABASE_URL` *or* `DATABASE_HOST/PORT/USER/PASSWORD/NAME` | required (defaults to localhost) |
| JWT | `JWT_SECRET`, `JWT_EXPIRATION`, `JWT_REFRESH_EXPIRATION` | **`JWT_SECRET` required** |
| Redis | `REDIS_URL`, `REDIS_TTL` | required (defaults to localhost) |
| Queue | `QUEUE_PREFIX`, `QUEUE_CONCURRENCY`, `QUEUE_DEFAULT_ATTEMPTS`, `QUEUE_DEFAULT_BACKOFF_MS`, `MEDIA_QUEUE_CONCURRENCY` | optional (defaults) |
| Rate limit | `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX` | optional (defaults) |
| Mail | `ZEPTOMAIL_URL`, `ZEPTOMAIL_TOKEN`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | optional (required for forgot-password) |
| OAuth | `GOOGLE_CLIENT_ID`, `APPLE_BUNDLE_ID` | conditional (per provider used) |
| Storage (GCS) | `GCS_BUCKET`, `GCP_PROJECT_ID`, `GCS_CREDENTIALS_JSON_BASE64`, `GCS_PRESIGN_EXPIRES` | conditional — flagged by `GCS_BUCKET` |
| SMS | `SMS_API_URL`, `SMS_USER`, `SMS_PASS`, `SMS_*_PARAM`, … | conditional — flagged by `SMS_API_URL` |
| Push (OneSignal) | `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `NOTIFICATION_BROADCAST_CHUNK_SIZE` | conditional — `REST_API_KEY` required when `APP_ID` set |
| Swagger | `SWAGGER_ENABLED`, `SWAGGER_BASIC_AUTH_USER/PASSWORD`, `SWAGGER_SERVERS` | optional |
| Bug reports | `BUG_REPORT_ATTACHMENTS_ENABLED` | optional (default `false`) |

Env is validated at boot by a Zod schema ([`src/modules/shared/common/config/env.schema.ts`](src/modules/shared/common/config/env.schema.ts)); invalid configuration fails fast.

## More docs

- [CLAUDE.md](CLAUDE.md) — architecture, conventions, ports, response contract
- [AGENTS.md](AGENTS.md) — agent/contributor quick guide
- [CONTRIBUTING.md](CONTRIBUTING.md) — commits, branching, required checks
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — local dev, new-feature flow, gates
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Docker, migrations, production
