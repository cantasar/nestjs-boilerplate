/** Injection tokens for Drizzle DB and underlying pg Pool. */
export const DATABASE_TOKENS = {
  DRIZZLE: Symbol('DRIZZLE'),
  DRIZZLE_POOL: Symbol('DRIZZLE_POOL'),
} as const;
