import { bugReports } from '../schema/bug-report.schema';

export type NewBugReport = typeof bugReports.$inferInsert;
