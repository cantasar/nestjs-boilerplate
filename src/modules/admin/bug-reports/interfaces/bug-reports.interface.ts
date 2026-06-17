import type { BugStatus } from '../enums/bug-status.enum';
import type { BugSeverity } from '../enums/bug-severity.enum';
import type { BugReport } from '../../../shared/database/types';
import type { MediaAssetView } from '../../../platform/media/interfaces/asset.types';

export interface BugReportListFilters {
  page: number;
  limit: number;
  search?: string;
  status?: BugStatus;
  severity?: BugSeverity;
  entityType?: string;
  entityId?: string;
  reporterId?: number;
  assigneeId?: number;
  includeInactive?: boolean;
}

export type BugReportWithAttachments = BugReport & {
  attachments: MediaAssetView[];
};
