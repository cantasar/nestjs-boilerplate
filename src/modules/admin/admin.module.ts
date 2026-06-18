import { Module } from '@nestjs/common';
import { BugReportsModule } from './bug-reports/bug-reports.module';

/**
 * Admin-panel aggregator. Only `imports:` its feature children — no controllers
 * or providers of its own. Add new admin features here as they land.
 */
@Module({
  imports: [BugReportsModule],
})
export class AdminModule {}
