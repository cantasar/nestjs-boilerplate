import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';
import { DATABASE_TOKENS } from '../../shared/database/database.tokens';
import type { DrizzleDB } from '../../shared/database/database.types';
import { legalDocuments } from '../../shared/database/schema/legal-document.schema';
import { userConsents } from '../../shared/database/schema/user-consent.schema';
import type { DocumentStore } from './interfaces/document-store.interface';
import type {
  LegalDocumentView,
  RecordConsentParams,
  UpsertDocumentParams,
  UserConsentView,
} from './interfaces/consent.types';

/**
 * Drizzle reference implementation of {@link DocumentStore}. Pure data access:
 * the legal-document side reads the versioned table and upholds the
 * one-current-per-slug invariant; the consent side appends to an immutable
 * history table.
 */
@Injectable()
export class ConsentRepository implements DocumentStore {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async findCurrent(type?: string): Promise<LegalDocumentView[]> {
    const where = type
      ? and(eq(legalDocuments.isCurrent, true), eq(legalDocuments.type, type))
      : eq(legalDocuments.isCurrent, true);
    return this.db.select().from(legalDocuments).where(where);
  }

  async findBySlug(slug: string): Promise<LegalDocumentView | undefined> {
    const [row] = await this.db
      .select()
      .from(legalDocuments)
      .where(
        and(eq(legalDocuments.slug, slug), eq(legalDocuments.isCurrent, true)),
      )
      .limit(1);
    return row;
  }

  async findByVersion(
    slug: string,
    version: string,
  ): Promise<LegalDocumentView | undefined> {
    const [row] = await this.db
      .select()
      .from(legalDocuments)
      .where(
        and(eq(legalDocuments.slug, slug), eq(legalDocuments.version, version)),
      )
      .limit(1);
    return row;
  }

  async upsertDocument(
    params: UpsertDocumentParams,
  ): Promise<LegalDocumentView> {
    // Atomic upsert on the (slug, version) unique index so two concurrent
    // uploads of the same version can't race into a raw unique violation.
    const [row] = await this.db
      .insert(legalDocuments)
      .values({
        slug: params.slug,
        version: params.version,
        type: params.type,
        title: params.title,
        content: params.content,
        isCurrent: params.isCurrent,
      })
      .onConflictDoUpdate({
        target: [legalDocuments.slug, legalDocuments.version],
        set: {
          type: params.type,
          title: params.title,
          content: params.content,
          isCurrent: params.isCurrent,
        },
      })
      .returning();
    if (!row) throw new Error('Failed to upsert legal document row');
    return row;
  }

  async clearOtherCurrents(slug: string, keepVersion: string): Promise<void> {
    // void-ok
    // Enforces the partial unique index invariant: at most one is_current=true
    // per slug. Demotes every other current version, leaving keepVersion (the
    // one being flipped to current) untouched.
    await this.db
      .update(legalDocuments)
      .set({ isCurrent: false })
      .where(
        and(
          eq(legalDocuments.slug, slug),
          eq(legalDocuments.isCurrent, true),
          ne(legalDocuments.version, keepVersion),
        ),
      );
  }

  async recordConsent(params: RecordConsentParams): Promise<UserConsentView> {
    const [row] = await this.db
      .insert(userConsents)
      .values({
        userId: params.userId,
        documentSlug: params.documentSlug,
        documentVersion: params.documentVersion,
        status: params.status,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      })
      .returning();
    if (!row) throw new Error('Failed to insert user consent row');
    return row;
  }

  async findLatestConsent(
    userId: number,
    slug: string,
  ): Promise<UserConsentView | undefined> {
    const [row] = await this.db
      .select()
      .from(userConsents)
      .where(
        and(
          eq(userConsents.userId, userId),
          eq(userConsents.documentSlug, slug),
        ),
      )
      .orderBy(desc(userConsents.changedAt))
      .limit(1);
    return row;
  }

  async findConsentsForUser(userId: number): Promise<UserConsentView[]> {
    return this.db
      .select()
      .from(userConsents)
      .where(eq(userConsents.userId, userId))
      .orderBy(desc(userConsents.changedAt));
  }
}
