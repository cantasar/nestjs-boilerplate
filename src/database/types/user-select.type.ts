import { users } from '../schema/user.schema';

/** User row selected from database. */
export type User = typeof users.$inferSelect;
