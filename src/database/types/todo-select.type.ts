import { todos } from '../schema/todo.schema';

export type Todo = typeof todos.$inferSelect;
