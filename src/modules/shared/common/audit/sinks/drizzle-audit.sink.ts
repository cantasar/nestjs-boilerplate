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
      // entity_id is varchar(128); truncate so an over-long id can't throw and
      // silently drop the whole audit row.
      entityId: entry.entityId?.slice(0, 128),
      before: this.boundSnapshot(redactSnapshot(entry.before)),
      after: this.boundSnapshot(redactSnapshot(entry.after)),
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

  /**
   * Cap the serialized snapshot size so a huge entity (large arrays, embedded
   * blobs) can't bloat the audit table; oversized snapshots are replaced with a
   * marker recording the dropped byte size.
   */
  private boundSnapshot(
    snapshot: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null | undefined {
    if (snapshot === null || snapshot === undefined) return snapshot;
    const bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    if (bytes <= MAX_SNAPSHOT_BYTES) return snapshot;
    return { _truncated: true, _bytes: bytes };
  }
}

// ~64 KB ceiling on a single before/after snapshot.
const MAX_SNAPSHOT_BYTES = 64 * 1024;
