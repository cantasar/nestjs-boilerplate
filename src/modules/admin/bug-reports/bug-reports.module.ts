import { Module } from '@nestjs/common';
import { BugReportsController } from './bug-reports.controller';
import { BugReportsService } from './bug-reports.service';
import { BugReportsRepository } from './bug-reports.repository';
import { DatabaseModule } from '../../shared/database/database.module';
import { MediaModule } from '../../platform/media/media.module';

/**
 * Admin bug-reports feature: CRUD + filter/search + soft-delete. Imports
 * MediaModule for the ASSET_PORT (attachment listing, feature-flagged). Audit is
 * cross-cutting (@Global AuditModule + @Audit), so it needs no import here.
 */
@Module({
  imports: [DatabaseModule, MediaModule],
  controllers: [BugReportsController],
  providers: [BugReportsService, BugReportsRepository],
})
export class BugReportsModule {}
