import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../shared/database/database.module';
import { FirstAdminSeed } from './first-admin.seed';

/** Startup seeds. Each seed checks its own env gate and skips when already applied. */
@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [FirstAdminSeed],
})
export class SeedsModule {}
