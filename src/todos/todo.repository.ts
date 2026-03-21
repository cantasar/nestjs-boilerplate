import { Inject, Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DATABASE_TOKENS } from '../database/database.tokens';
import type { DrizzleDB } from '../database/database.types';
import { todos } from '../database/schema/todo.schema';
import type { Todo } from '../database/types/todo-select.type';
import type { NewTodo } from '../database/types/todo-insert.type';

@Injectable()
export class TodoRepository {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async findByUserId(userId: number): Promise<Todo[]> {
    return this.db
      .select()
      .from(todos)
      .where(eq(todos.userId, userId))
      .orderBy(desc(todos.createdAt));
  }

  async findById(id: number, userId: number): Promise<Todo | undefined> {
    const [row] = await this.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)))
      .limit(1);
    return row;
  }

  async create(data: NewTodo): Promise<Todo | undefined> {
    const [row] = await this.db.insert(todos).values(data).returning();
    return row;
  }

  async update(
    id: number,
    userId: number,
    data: Partial<NewTodo>,
  ): Promise<Todo | undefined> {
    const [row] = await this.db
      .update(todos)
      .set(data)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)))
      .returning();
    return row;
  }

  async delete(id: number, userId: number): Promise<void> {
    await this.db
      .delete(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)));
  }
}
