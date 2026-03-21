# Development Guide

---

## Tools

| Tool      | Command                                       |
| --------- | --------------------------------------------- |
| Oxlint    | `pnpm run lint`                               |
| Oxfmt     | `pnpm run format`                             |
| Unit test | `pnpm run test`                               |
| E2E test  | `pnpm run test:e2e`                           |
| Drizzle   | `pnpm run db:generate`, `db:migrate`, `db:push`, `db:studio` |

---

## Creating a New Module

### 1. Schema

`src/database/schema/<entity>.schema.ts`

```ts
import { pgTable, serial, varchar, integer } from "drizzle-orm/pg-core";
import { users } from "./user.schema";

export const todos = pgTable("todos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
});

```

Inferred row/insert types live under **`src/database/types/`** (one export per file), e.g. `todo-select.type.ts`, `todo-insert.type.ts`, importing table definitions from `../schema/`.

- `src/database/schema/index.ts` → re-export table definitions only.
- `src/database/types/index.ts` → re-export inferred types.

### 2. Repository

`src/<module>/<entity>.repository.ts`

```ts
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DATABASE_TOKENS } from "../database/database.tokens";
import type { DrizzleDB } from "../database/database.types";
import { todos } from "../database/schema/todo.schema";

@Injectable()
export class TodoRepository {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async findByUserId(userId: number) {
    return this.db.select().from(todos).where(eq(todos.userId, userId));
  }
}
```

### 3. DTOs

`src/<module>/dto/create-<entity>.dto.ts`, `update-<entity>.dto.ts`

```ts
export class CreateTodoDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;
}
```

### 4. Service

`src/<module>/<entity>.service.ts` – business logic, repository inject

### 5. Controller

`src/<module>/<entity>.controller.ts` – `@UseGuards(JwtGuard)`, `@GetUser('id')`

### 6. Module

`src/<module>/<module>.module.ts` – add to AppModule

### 7. Migration

```bash
pnpm run db:generate
pnpm run db:migrate
```

---

## Quick Reference

```
src/<module>/
  <module>.module.ts
  <entity>.controller.ts
  <entity>.service.ts
  <entity>.repository.ts
  dto/
    create-<entity>.dto.ts
    update-<entity>.dto.ts

src/database/schema/
  <entity>.schema.ts
src/database/types/
  <entity>-select.type.ts
  <entity>-insert.type.ts
```

---

## Redis Usage

Use `RedisService` in application services instead of injecting raw client directly.

```ts
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

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
