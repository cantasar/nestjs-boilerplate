import {
  Global,
  Logger,
  Module,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { getDatabaseUrl } from '../common/config/database.config';
import { DATABASE_TOKENS } from './database.tokens';
import type { DrizzleDB } from './database.types';

const poolLogger = new Logger('DatabasePool');

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
      provide: DATABASE_TOKENS.DRIZZLE,
      inject: ['DRIZZLE_CONFIG'],
      useFactory: (config: { db: DrizzleDB; pool: Pool }) => config.db,
    },
    {
      provide: DATABASE_TOKENS.DRIZZLE_POOL,
      inject: ['DRIZZLE_CONFIG'],
      useFactory: (config: { db: DrizzleDB; pool: Pool }) => config.pool,
    },
  ],
  exports: [DATABASE_TOKENS.DRIZZLE, DATABASE_TOKENS.DRIZZLE_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE_POOL) private readonly pool: Pool,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
