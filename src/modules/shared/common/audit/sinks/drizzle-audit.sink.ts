import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_TOKENS } from '../../../database/database.tokens';
import type { DrizzleDB } from '../../../database/database.types';
import { auditLogs } from '../../../database/schema';
import type { NewAuditLog } from '../../../database/types';
import type { AuditSink } from '../interfaces/audit-sink.interface';
import type { AuditEntry } from '../interfaces/audit-entry.types';
import { redactSnapshot } from './redact-sensitive.util';

/**
 * Reference AuditSink backed by Drizzle. Writes one audit_logs row per entry,
 * out of band from the business transaction: the insert runs on its own
 * connection and its failure is swallowed (logged) so auditing can never break
 * a successful request. Swap this for another sink by re-binding AUDIT_SINK.
 */
@Injectable()
export class DrizzleAuditSink implements AuditSink {
  private readonly logger = new Logger(DrizzleAuditSink.name);

  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  // void-ok
  async logChange(entry: AuditEntry): Promise<void> {
    const row: NewAuditLog = {
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: redactSnapshot(entry.before),
      after: redactSnapshot(entry.after),
      actorId: entry.actorId,
      requestId: entry.requestId,
      at: entry.at,
    };
    try {
      await this.db.insert(auditLogs).values(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to write audit log: ${message}`, stack);
    }
  }
}
