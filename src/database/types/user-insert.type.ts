import { users } from '../schema/user.schema';

/** User insert payload for Drizzle. */
export type NewUser = typeof users.$inferInsert;
