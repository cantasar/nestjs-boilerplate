# Development Guide

Local development, the new-feature flow, and the gates a change must pass. Architecture and conventions live in [CLAUDE.md](../CLAUDE.md); this guide is the practical companion.

## Tools

| Task | Command |
|------|---------|
| Dev server (watch) | `pnpm start:dev` |
| Build | `pnpm build` |
| Lint (autofix) | `pnpm lint` |
| Lint (check + guards) | `pnpm lint:check` |
| Format / check | `pnpm format` · `pnpm format:check` |
| Unit tests | `pnpm test` |
| Single spec | `pnpm test -- <path-or-pattern>` |
| Coverage | `pnpm test:cov` |
| E2E tests | `pnpm test:e2e` |
| Drizzle | `pnpm db:generate` · `db:migrate` · `db:push` · `db:studio` |
| Generate API docs | `pnpm docs:generate` |

## Grouped structure

All feature code lives under `src/modules/`, grouped into `shared/` (cross-cutting infra), `platform/` (transports / infra-as-feature), `user/` (end-user features), `admin/` (admin panel), and `_template/` (copy-me reference). Do not add new top-level folders under `src/`. See [CLAUDE.md §5](../CLAUDE.md) for the placement rules and the per-feature folder layout.

A feature folder stays flat until a category earns a subfolder:

```
modules/<group>/<feature>/
  <feature>.module.ts          # always at root
  <feature>.controller.ts      # flat if 1; controllers/ when ≥2
  <feature>.service.ts         # flat if 1; services/ when ≥2
  <feature>.repository.ts      # flat if 1; repositories/ when ≥2
  dto/  enums/  interfaces/  constants/  mappers/  tests/
```

## Creating a new feature

The fastest path is to **copy `src/modules/_template/todo/`** — it is a complete, working CRUD feature (controller, service, repository, DTOs, audit decorators, and specs) wired to `DatabaseModule`.

1. Copy `_template/todo` into the right group, e.g. `modules/<group>/<feature>/`, and rename files/classes.
2. Add the Drizzle table under `shared/database/schema/`, export it from the schema `index.ts`, and add inferred row/insert types under `shared/database/types/`.
3. Reach external dependencies through their **port**, never a vendor SDK directly (see Ports below).
4. Wire the feature module into `AppModule.imports` in `src/app.module.ts`.
5. Add Swagger decorators on the controller; **one response DTO per shape** (one exported class per `*.dto.ts`).
6. Add `*.spec.ts` for the service and controller (any depth — Jest's `testRegex` matches nested `tests/`).

## Ports

Every external dependency is reached through a NestJS provider behind an injection token or a thin service, so the implementation swaps without touching callers. Edit the implementation behind the abstraction and keep its public signature.

| Concern | Token / abstraction | Defined in |
|---------|---------------------|------------|
| User persistence | `UserRepository` | `shared/database/repositories/user.repository.ts` |
| Audit sink | `AUDIT_SINK` | `shared/common/audit/constants/audit.tokens.ts` |
| Object storage | `STORAGE_SERVICE` | `platform/storage/interfaces/storage.types.ts` |
| SMS sender | `SMS_SENDER` | `platform/sms/interfaces/sms-sender.interface.ts` |
| Push sender | `PUSH_SENDER` | `platform/notifications/interfaces/push-sender.interface.ts` |
| Notification port | `NOTIFICATION_PORT` | `platform/notifications/interfaces/notification-port.interface.ts` |
| Media asset port | `ASSET_PORT` | `platform/media/interfaces/asset-port.interface.ts` |
| Document store | `DOCUMENT_STORE` | `user/consent/interfaces/document-store.interface.ts` |

If you find yourself importing a vendor SDK type outside its `platform/<concern>` service, that leak is the bug. See [CLAUDE.md §7](../CLAUDE.md) for the full swap-point table.

## Separation of concerns & lint guards

Controllers stay thin; business rules live in services; persistence in repositories; pure entity→DTO mapping in `mappers/`. Beyond Oxlint + Oxfmt, four custom guards run in `pnpm lint:check` and in the `lint-staged` pre-commit hook:

| Guard | Enforces |
|-------|----------|
| `lint:no-double-cast` | No `as unknown as` in production code (specs may use it for mock typing) |
| `lint:no-prod-never` | No `as never` cast in production code — use literal union types |
| `lint:no-untyped-promise` | Floating/untyped promises rejected; mark intentional fire-and-forget with a `// void-ok` comment |
| `lint:no-multi-class-dto` | At most one exported class per `*.dto.ts` |

## Migrations

Migration files are **not** committed — `drizzle/` is empty until you generate them.

- Local iteration: `pnpm db:push` (applies the schema, no migration files).
- Producing migrations: `pnpm db:generate` then `pnpm db:migrate`. Generate them at merge/deploy time, not on every working branch.

## The gates

Before declaring a change done:

```bash
pnpm build          # must be clean
pnpm lint:check     # Oxlint + the four guards
pnpm format:check   # Oxfmt
pnpm test           # new/affected specs pass
```

Lint and format are also enforced by Husky + lint-staged on commit, but run them yourself before finishing.

## Redis usage

Use `RedisService` in application code rather than injecting the raw ioredis client.

```ts
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../shared/redis/redis.service';

@Injectable()
export class ExampleService {
  constructor(private readonly redisService: RedisService) {}

  async saveToken(userId: number, token: string): Promise<void> {
    await this.redisService.setWithExpirySeconds(`token:${userId}`, token, 300);
  }

  async readToken(userId: number): Promise<string | null> {
    return this.redisService.get(`token:${userId}`);
  }
}
```
