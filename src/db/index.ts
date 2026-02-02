import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index';

export const createDrizzleClient = (connectionString: string) => {
    const pool = new Pool({ connectionString });

    // Pool error handling
    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
    });

    return drizzle({ client: pool, schema });
};

export type DrizzleDB = ReturnType<typeof createDrizzleClient>;

// Re-export schema
export * from './schema/index';
