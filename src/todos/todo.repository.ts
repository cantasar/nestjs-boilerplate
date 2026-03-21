import { Inject, Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DATABASE_TOKENS } from '../database/database.tokens';
import type { DrizzleDB } from '../database/database.types';
import { todos } from '../database/schema/todo.schema';
import type { Todo } from '../database/types/todo-select.type';
import type { NewTodo } from '../database/types/todo-insert.type';

/**
 * Todo persistence operations.
 */
@Injectable()
export class TodoRepository {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  /**
   * Lists todos by user id.
   * @param userId - User id
   * @returns Todo list
   */
  async findByUserId(userId: number): Promise<Todo[]> {
    return this.db
      .select()
      .from(todos)
      .where(eq(todos.userId, userId))
      .orderBy(desc(todos.createdAt));
  }

  /**
   * Finds todo by id and user id.
   * @param id - Todo id
   * @param userId - User id
   * @returns Todo or undefined
   */
  async findById(id: number, userId: number): Promise<Todo | undefined> {
    const [row] = await this.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)))
      .limit(1);
    return row;
  }

  /**
   * Creates a new todo.
   * @param data - Todo insert data
   * @returns Created todo or undefined
   */
  async create(data: NewTodo): Promise<Todo | undefined> {
    const [row] = await this.db.insert(todos).values(data).returning();
    return row;
  }

  /**
   * Updates a todo.
   * @param id - Todo id
   * @param userId - User id
   * @param data - Partial update data
   * @returns Updated todo or undefined
   */
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

  /**
   * Deletes a todo.
   * @param id - Todo id
   * @param userId - User id
   */
  async delete(id: number, userId: number): Promise<void> {
    await this.db
      .delete(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)));
  }
}
