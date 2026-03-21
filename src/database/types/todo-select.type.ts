import { todos } from '../schema/todo.schema';

/** Todo row selected from database. */
export type Todo = typeof todos.$inferSelect;
