import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../shared/database/database.module';
import { FirstAdminSeed } from './first-admin.seed';

/**
 * Idempotent bootstrap seeds: each provider implements OnApplicationBootstrap,
 * checks its own precondition (env gate + existence check), and no-ops when
 * already applied — safe to run on every deploy and across replicas
 * (insert paths use onConflictDoNothing).
 *
 * Add app-specific reference-data seeds as further providers here; keep each
 * seed one class per file and order-independent where possible.
 */
@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [FirstAdminSeed],
})
export class SeedsModule {}
