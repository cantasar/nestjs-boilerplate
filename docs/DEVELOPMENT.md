# Geliştirme Rehberi

---

## Araçlar

| Araç | Komut |
|------|-------|
| ESLint | `npm run lint` |
| Prettier | `npm run format` |
| Unit test | `npm run test` |
| E2E test | `npm run test:e2e` |
| Drizzle | `npm run db:generate`, `db:push`, `db:studio` |

Husky + lint-staged: commit öncesi otomatik lint/format.

---

## Yeni Modül Oluşturma

### 1. Schema

`src/database/schema/<entity>.schema.ts`

```ts
import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const todos = pgTable('todos', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
```

`src/database/schema/index.ts` → `export * from './todo.schema';`

### 2. Repository

`src/<module>/<entity>.repository.ts`

```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { todos } from '../database/schema/todo.schema';

@Injectable()
export class TodoRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByUserId(userId: number) {
    return this.db.select().from(todos).where(eq(todos.userId, userId));
  }
}
```

### 3. DTO'lar

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

`src/<module>/<entity>.service.ts` – iş mantığı, repository inject

### 5. Controller

`src/<module>/<entity>.controller.ts` – `@UseGuards(JwtGuard)`, `@GetUser('id')`

### 6. Module

`src/<module>/<module>.module.ts` – AppModule'e ekle

### 7. Migration

```bash
npm run db:generate
npm run db:push
```

---

## Hızlı Referans

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
```
