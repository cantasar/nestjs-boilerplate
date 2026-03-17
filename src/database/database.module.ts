import { Global, Logger, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { getDatabaseUrl } from '../config/database.config';

const poolLogger = new Logger('DatabasePool');

export const DRIZZLE = Symbol('DRIZZLE');
export const DRIZZLE_POOL = Symbol('DRIZZLE_POOL');
export type DrizzleDB = ReturnType<typeof drizzle>;

@Global()
@Module({
  providers: [
    {
      provide: 'DRIZZLE_CONFIG',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connectionString = getDatabaseUrl(configService);
        const pool = new Pool({
          connectionString,
          max: 10,
          idleTimeoutMillis: 30000,
        });
        pool.on('error', (err) =>
          poolLogger.error(
            'Unexpected error on idle client',
            err instanceof Error ? err.stack : String(err),
          ),
        );
        return {
          db: drizzle({ client: pool, schema }),
          pool,
        };
      },
    },
    {
      provide: DRIZZLE,
      inject: ['DRIZZLE_CONFIG'],
      useFactory: (config: { db: DrizzleDB; pool: Pool }) => config.db,
    },
    {
      provide: DRIZZLE_POOL,
      inject: ['DRIZZLE_CONFIG'],
      useFactory: (config: { db: DrizzleDB; pool: Pool }) => config.pool,
    },
  ],
  exports: [DRIZZLE, DRIZZLE_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DRIZZLE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
