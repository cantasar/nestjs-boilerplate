import { Inject, Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { todos, type NewTodo } from '../database/schema/todo.schema';

@Injectable()
export class TodoRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByUserId(userId: number) {
    return this.db
      .select()
      .from(todos)
      .where(eq(todos.userId, userId))
      .orderBy(desc(todos.createdAt));
  }

  async findById(id: number, userId: number) {
    const [row] = await this.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)))
      .limit(1);
    return row;
  }

  async create(data: NewTodo) {
    const [row] = await this.db.insert(todos).values(data).returning();
    return row;
  }

  async update(id: number, userId: number, data: Partial<NewTodo>) {
    const [row] = await this.db
      .update(todos)
      .set(data)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)))
      .returning();
    return row;
  }

  async delete(id: number, userId: number) {
    await this.db
      .delete(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)));
  }
}
