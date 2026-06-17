import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { DATABASE_TOKENS } from '../../shared/database/database.tokens';
import type { DrizzleDB } from '../../shared/database/database.types';
import { bugReports } from '../../shared/database/schema/bug-report.schema';
import type { BugReport, NewBugReport } from '../../shared/database/types';
import type { BugReportListFilters } from './interfaces/bug-reports.interface';

@Injectable()
export class BugReportsRepository {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async create(data: NewBugReport): Promise<BugReport> {
    const [row] = await this.db.insert(bugReports).values(data).returning();
    if (!row) throw new Error('Failed to insert bug_reports row');
    return row;
  }

  async findById(
    id: string,
    options?: { includeInactive?: boolean },
  ): Promise<BugReport | undefined> {
    const conditions: SQL[] = [eq(bugReports.id, id)];
    if (!options?.includeInactive) {
      conditions.push(eq(bugReports.isActive, true));
    }
    const rows = await this.db
      .select()
      .from(bugReports)
      .where(and(...conditions))
      .limit(1);
    return rows[0];
  }

  async findAll(
    filters: BugReportListFilters,
  ): Promise<{ data: BugReport[]; total: number }> {
    const { page, limit } = filters;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (!filters.includeInactive) {
      conditions.push(eq(bugReports.isActive, true));
    }
    if (filters.search) {
      // Escape LIKE wildcards so user input is matched literally, not as a
      // pattern (a stray % / _ would otherwise broaden or skew the search).
      const escaped = filters.search.replace(/[\\%_]/g, '\\$&');
      const pattern = `%${escaped}%`;
      conditions.push(
        or(
          ilike(bugReports.title, pattern),
          ilike(bugReports.description, pattern),
        ) as SQL,
      );
    }
    if (filters.status) conditions.push(eq(bugReports.status, filters.status));
    if (filters.severity)
      conditions.push(eq(bugReports.severity, filters.severity));
    if (filters.entityType)
      conditions.push(eq(bugReports.entityType, filters.entityType));
    if (filters.entityId)
      conditions.push(eq(bugReports.entityId, filters.entityId));
    if (filters.reporterId !== undefined)
      conditions.push(eq(bugReports.reporterId, filters.reporterId));
    if (filters.assigneeId !== undefined)
      conditions.push(eq(bugReports.assigneeId, filters.assigneeId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(bugReports)
      .where(where);
    const total = totalRow ? Number(totalRow.count) : 0;

    const data = await this.db
      .select()
      .from(bugReports)
      .where(where)
      .orderBy(desc(bugReports.createdAt), desc(bugReports.id))
      .limit(limit)
      .offset(offset);

    return { data, total };
  }

  async update(
    id: string,
    patch: Partial<NewBugReport>,
  ): Promise<BugReport | undefined> {
    if (Object.keys(patch).length === 0) return this.findById(id);
    const [row] = await this.db
      .update(bugReports)
      .set(patch)
      .where(eq(bugReports.id, id))
      .returning();
    return row;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(bugReports)
      .where(eq(bugReports.id, id))
      .returning({ id: bugReports.id });
    return result.length > 0;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .update(bugReports)
      .set({ isActive: false })
      .where(eq(bugReports.id, id))
      .returning({ id: bugReports.id });
    return result.length > 0;
  }
}
