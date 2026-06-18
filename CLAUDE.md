# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Project-specific conventions for this NestJS boilerplate follow the general rules.

**Stack:** NestJS 11, Drizzle ORM + PostgreSQL, ioredis, Passport JWT, class-validator/class-transformer, nestjs-pino, Swagger. **Node 24, pnpm only** (never npm/yarn). Single language: **English** (i18n is out of scope — do not add locale machinery).

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.
- Remove imports/variables/functions that YOUR changes made unused. Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan with a verify check per step. Strong success criteria let you loop independently; weak criteria ("make it work") require constant clarification.

---

## 5. Project Structure

All feature code lives under `src/modules/`, **grouped by domain**. Place new code in the matching group; do not add new top-level folders under `src/`.

```
src/
├── app.module.ts                  # root wiring: global guards, ConfigModule, LoggerModule, ThrottlerModule, feature modules
├── main.ts                        # bootstrap: helmet, CORS, body parser, versioning, global pipe + filter, swagger
├── swagger/                       # bootstrap-only swagger setup, NOT a NestJS module
└── modules/
    ├── shared/                    # cross-cutting infra (imported by 3+ modules)
    │   ├── common/                # config, decorators, enums, filters, guards, types, utils, validators
    │   ├── database/              # Drizzle schema, types, repositories, DatabaseModule, injection tokens
    │   └── redis/                 # ioredis client + RedisService
    ├── platform/                  # platform-level services (transports / infra-as-feature)
    │   ├── auth/                  # JWT, OAuth (Google/Apple), password reset, strategies
    │   ├── mail/                  # transactional mail + templates
    │   └── health/                # /health (VERSION_NEUTRAL, unprefixed)
    ├── user/                      # end-user-facing (mobile/web app) features — add as needed
    ├── admin/                     # admin-panel features — add as needed
    └── _template/                 # copy-from scaffold; NOT wired into production behavior
        └── todo/                  # reference feature: controller + service + repository + dto + specs
```

`user/` and `admin/` are **conventional groups** — create the directory when the first feature lands there. Do not invent other top-level groups.

### Groups — where does new code go?

- **`shared/`** — infra used by 3+ modules (config, DB, redis, global guards/filters/decorators). Otherwise keep it inside the consuming feature.
- **`platform/`** — a transport or infrastructure capability exposed as a feature (auth, mail, sms, storage, health). One external concern per folder.
- **`user/`** — features the mobile/web client calls (profile, etc.).
- **`admin/`** — admin-panel/back-office features.
- **`_template/`** — the scaffold you copy from. Never add real product logic here, never depend on it from production modules.

### Routing & versioning

Native URI versioning + global prefix, configured once in [`src/modules/shared/common/config/app-versioning.ts`](src/modules/shared/common/config/app-versioning.ts) (`configureVersioning`, called from `main.ts`):

- `API_PREFIX = 'api'`, `API_VERSION = '1'` → every route resolves under `/api/v1/...`.
- Controllers declare `@Controller({ path: 'todos', version: '1' })`. The `/api` prefix is injected globally; the `version` segment becomes `/v1`.
- **Unversioned infra:** `health` and root `/` are excluded from the prefix and declared `VERSION_NEUTRAL`, so they resolve at `/health` and `/`.
- **Adding a v2:** drop a sibling controller `@Controller({ path, version: '2' })` in the same feature folder reusing the existing service. No prefix change needed → `/api/v2/...`.

### Per-feature folder layout

Keep a feature flat until a category earns a subfolder. Create the subfolder only when its rule fires (else keep the file at the feature root):

```
modules/<group>/<feature>/
  <feature>.module.ts                # always at root
  <feature>.controller.ts            # flat if 1; controllers/ when ≥2
  <feature>.service.ts               # flat if 1; services/ when ≥2
  <feature>.repository.ts            # flat if 1; repositories/ when ≥2
  <feature>.constants.ts             # OR constants/*.constants.ts when many
  dto/        <x>.dto.ts             # one exported class per file (see SoC)
  interfaces/ <x>.types.ts           # exported type/interface extracted from logic files
  mappers/    <x>.mapper.ts          # PURE entity→DTO mapping pulled out of services
  enums/ events/ listeners/ utils/ lib/
  *.spec.ts                          # specs co-located (jest testRegex matches any depth)
```

The `_template/todo` feature is the reference layout: controller + service + repository + `dto/` + co-located `*.spec.ts`.

### Database conventions

- Drizzle schema lives in `shared/database/schema/*.schema.ts`, re-exported from `schema/index.ts`.
- Inferred row types go in `shared/database/types/` (`<x>-select.type.ts`, `<x>-insert.type.ts`). Import the inferred type, don't redefine row shapes.
- The Drizzle instance is injected via the `DATABASE_TOKENS.DRIZZLE` symbol (see `database.tokens.ts`). Repositories take it through DI; never call `drizzle()` outside `DatabaseModule`.
- **Migrations are out of band.** Do not run `db:generate`/`db:migrate` as part of a feature change unless explicitly asked.

### Import-path convention

- No path aliases configured. Use **relative paths**, e.g. from `modules/_template/todo/` import the guard via `../../shared/common/guards/jwt.guard`. Don't add `@modules/*` aliases without discussion.

## 6. Adding a new feature (copy `_template/todo`)

1. Copy `src/modules/_template/todo/` into the right group (`user/<feature>`, `admin/<feature>`, or `platform/<feature>`).
2. Rename files/classes (`todo` → `<feature>`); fix relative imports.
3. Define the Drizzle schema in `shared/database/schema/`, export from `index.ts`, add inferred types under `shared/database/types/`.
4. Wire the feature module into `AppModule.imports` in `app.module.ts`.
5. Add Swagger decorators on the controller; one response DTO per shape.
6. Add `*.spec.ts` for service and controller.

## 7. Port / interface strategy & swap points

Every external dependency is reached through a **NestJS provider behind an injection token or a thin service**, so the implementation can be swapped without touching callers. Callers depend on the abstraction, never the vendor SDK.

| Concern  | Swap point | Token / abstraction | Vendor today |
|----------|-----------|---------------------|--------------|
| Database | `shared/database/database.module.ts` | `DATABASE_TOKENS.DRIZZLE` / `DRIZZLE_POOL` | `pg` Pool + Drizzle |
| Cache / KV | `shared/redis/redis.service.ts` | `REDIS_CLIENT` token + `RedisService` API | ioredis |
| Mail | `platform/mail/mail.service.ts` | `MailService` public methods | ZeptoMail |
| Auth identity | `platform/auth/strategies/jwt.strategy.ts` + OAuth verifiers | Passport strategy + `AuthService` | passport-jwt, google/apple verifiers |

**To swap a vendor:** replace the implementation behind the token/service and keep its public signature. Consumers (`@Inject(TOKEN)` or constructor-injected service) are untouched. New external concerns follow the same shape: add a `platform/<concern>/` folder, expose a service or token, never leak the SDK type past the service boundary.

## 8. Response envelope (v1 contract)

Every JSON response from a versioned (`/api/v1`) route is a **single, uniform envelope**. The HTTP status line is the source of truth for success; the body restates it via the `success` flag.

**Success** (2xx):
```json
{ "success": true, "data": <payload>, "meta": { ... } }
```
- `data` is the resource or list. `meta` is optional (pagination, totals); omit when empty.
- A `204 No Content` is normalized to **`200` + `data: null`** so clients always parse a body.

**Error** (4xx/5xx):
```json
{ "success": false, "error": { "code": "STRING_CODE", "message": "human readable", "details": [ ... ] } }
```
- `error.code` is a stable machine string; `message` is for humans/logs; `details` is optional (e.g. per-field validation issues).

**Hard rules:**
- **A `200` response with `success: false` is forbidden.** Failures carry a 4xx/5xx status. Never return `success: false` on a 2xx.
- **Services throw; the global filter wraps.** Business code throws a typed exception and returns the domain object on success — it does not assemble the envelope. The success envelope is applied by a response interceptor; the error envelope by the global exception filter ([`http-exception.filter.ts`](src/modules/shared/common/filters/http-exception.filter.ts)).
- Controllers return the **domain object / DTO**, not the envelope.

## 9. Error & HTTP status policy

- **400 vs 422.** `400 Bad Request` = the request could not be parsed/validated (malformed body, wrong type, `ValidationPipe` rejection). `422 Unprocessable Entity` = the request was well-formed but violates a **business rule** (e.g. email already taken, state transition not allowed). Pick the status by this distinction, not by habit.
- **Throw typed exceptions, never `throw new Error(...)`** in request-handling code. Use `DomainException` (or the matching Nest `HttpException` subclass) carrying a stable `code` from a central **error registry** (`shared/common/errors/`), so the same failure always maps to the same `error.code` + status. `throw new Error` is reserved for truly unexpected/internal faults and surfaces as `500`.
- The global filter ([`http-exception.filter.ts`](src/modules/shared/common/filters/http-exception.filter.ts)) is the **only** place that serializes errors. It maps the exception → status + envelope, logs 5xx with stack and 4xx as warnings, and never leaks internal messages on a `500`.

## 10. Separation of concerns (SoC)

- **One DTO file = one exported class.** `create-todo.dto.ts` exports exactly `CreateTodoDto`. No bundling multiple DTOs per file.
- **No inline `type`/`interface` inside a DTO file.** Shared/extracted types live in `interfaces/<x>.types.ts`. A DTO file contains only its request/response class.
- **Constants live in `constants/<x>.constants.ts`** (or a feature-root `<feature>.constants.ts` when small). No magic literals scattered across services.
- **Mappers are pure** (`mappers/<x>.mapper.ts`): entity → DTO with no `this`/DI dependency. Mapping that needs injected state (e.g. building a presigned URL) stays inline in the service.
- **Layering:** controller (HTTP + Swagger + validation) → service (business logic, throws domain exceptions) → repository (Drizzle queries only). Don't query the DB from a controller or put HTTP concerns in a repository.
- **Domains stay decoupled.** A feature module must not import another feature's service, repository, or schema tables directly. Cross-domain links go through a generic abstraction — a port behind an injection token (e.g. `ASSET_PORT`, `DOCUMENT_STORE`) or an **opaque generic reference** (`(entityType, entityId)` pairs the platform layer assigns no meaning to) — never a hard dependency on another domain's internals. `platform/` modules in particular are domain-agnostic: they know nothing about which tables hold their keys or what an entity *is*. Truly shared concerns move to `shared/`. This keeps each domain independently swappable, testable, and free of cross-feature import cycles.

## 11. Tooling

- **pnpm only.** `pnpm install`, `pnpm build`, `pnpm test`, `pnpm lint`.
- Lint/format via **Oxlint + Oxfmt** (`pnpm lint`, `pnpm format`). Husky + lint-staged run them on staged files.
- **i18n is out of scope.** All user-facing strings are English; do not add translation layers.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
