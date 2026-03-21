import { users } from '../schema/user.schema';

export type User = typeof users.$inferSelect;
