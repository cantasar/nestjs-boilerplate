import { bugReports } from '../schema/bug-report.schema';

export type BugReport = typeof bugReports.$inferSelect;
