import { users } from '../schema/user.schema';

export type NewUser = typeof users.$inferInsert;
