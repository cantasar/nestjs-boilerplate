import { todos } from '../schema/todo.schema';

/** Todo insert payload for Drizzle. */
export type NewTodo = typeof todos.$inferInsert;
