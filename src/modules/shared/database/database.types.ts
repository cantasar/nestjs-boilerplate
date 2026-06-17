import type { drizzle } from 'drizzle-orm/node-postgres';

export type DrizzleDB = ReturnType<typeof drizzle>;
