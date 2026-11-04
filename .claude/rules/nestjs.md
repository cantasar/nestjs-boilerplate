---
paths:
  - "src/**"
  - "test/**"
---

# NestJS code rules

## Where code goes

```
src/
├── main.ts, app.module.ts, load-env.ts, migrate.ts
├── swagger/setup-swagger.ts
└── modules/
    ├── shared/     used by 3+ modules: common/ (config, decorators, dto, enums, errors, filters, guards, interceptors, types, utils), database/, redis/
    ├── platform/   one infra concern per folder: auth, mail, queue, webhooks, health, internal, seeds
    ├── user/       features the mobile/web app calls (create when the first one lands)
    ├── admin/      admin panel features (create when the first one lands)
    └── _template/todo/   copy-me example, no real product logic
```

New feature: copy `_template/todo` into the right group, rename, add the Drizzle schema in `shared/database/schema/` (+ `index.ts` export, inferred types in `shared/database/types/`), import the module in `app.module.ts`.

Feature folder: `<feature>.module.ts`, `.controller.ts`, `.service.ts`, `.repository.ts` at the root. Subfolders only when needed: `dto/`, `enums/`, `interfaces/`, `constants/`, `mappers/`.

## Hard rules

- **One DTO per file** (`dto/<name>.dto.ts`) and **one enum per file** (`enums/<name>.enum.ts`). `pnpm lint:check` enforces both.
- **Layers**: controller (HTTP, Swagger, validation) → service (business logic, throws) → repository (Drizzle queries only). A service never injects the database.
- **Responses**: controllers return the plain object or DTO. The interceptor wraps it as `{ success: true, data, meta? }`. Never build the envelope yourself.
- **Errors**: throw `DomainException(<code>)` with a code from `shared/common/errors/`, or a Nest `HttpException`. Never `throw new Error()` in request code. 400 = bad input, 422 = valid input that breaks a business rule.
- **Auth**: every route needs a JWT unless it has `@Public()`. Use `@Roles(UserRole.ADMIN)` for admin routes. Use `@ApiKeyAuth()` for server-to-server routes.
- **Domains stay apart**: a feature never imports another feature's service, repository or tables. Share through `shared/` or an injection token.
- **Vendors behind a service**: SDK types never leave their `platform/<concern>/` folder.
- **Env vars**: add new ones to `shared/common/config/env.schema.ts` and `.env.example` in the same change.
- **Types**: no `any`, no `as unknown as`, no `as never`, no `Promise<any|unknown>`.
- **Imports**: relative paths only, no path aliases.
- **Comments**: max 1 or 2 short sentences. Explain why, not what.
- **Migrations**: edit the schema, but run `pnpm db:*` only when the user asks.

## Swagger (short but strong)

- Every controller: `@ApiTags`. Every route: `@ApiOperation({ summary })`, plus `description` only when the caller must know something extra (one sentence).
- Document the success shape with `@ApiOkEnvelope(Dto)` / `@ApiPaginatedEnvelope(Dto)`, and each real error status with one short description.
- Every DTO field: `@ApiProperty` with an `example`. Enums: `enum` + `enumName`.
- Add new user-facing tags to `MOBILE_TAGS` in `src/swagger/setup-swagger.ts`.
