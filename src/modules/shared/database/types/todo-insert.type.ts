import { todos } from '../schema/todo.schema';

export type NewTodo = typeof todos.$inferInsert;
