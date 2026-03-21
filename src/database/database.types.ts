import type { drizzle } from 'drizzle-orm/node-postgres';

/**
 * Type of the Drizzle **client** returned by `drizzle({ client, schema })`.
 * Use this for `@Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB`.
 * For table row types (`User`, `Todo`), import from `./types/` instead.
 */
export type DrizzleDB = ReturnType<typeof drizzle>;
