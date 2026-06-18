import type {
  LegalDocumentView,
  RecordConsentParams,
  UpsertDocumentParams,
  UserConsentView,
} from './consent.types';

/**
 * Provider-agnostic store for legal documents + user consent history. Consumers
 * inject the `DOCUMENT_STORE` token, never the concrete repository, so the
 * persistence backend can be swapped without touching callers.
 *
 * Document lookups read the versioned `legal_documents` table; consent methods
 * read/append the append-only `user_consents` history. The store assigns no
 * meaning to `type`/`slug` beyond grouping, so it references no domain tables.
 */
export interface DocumentStore {
  /** Every current (live) document, optionally filtered by `type`. */
  findCurrent(type?: string): Promise<LegalDocumentView[]>;

  /** The current (live) version of one document by slug, if any. */
  findBySlug(slug: string): Promise<LegalDocumentView | undefined>;

  /** A specific (slug, version) pair, current or not, if it exists. */
  findByVersion(
    slug: string,
    version: string,
  ): Promise<LegalDocumentView | undefined>;

  /** Insert or replace a (slug, version) document. */
  upsertDocument(params: UpsertDocumentParams): Promise<LegalDocumentView>;

  /**
   * Demote every other current version of `slug`, keeping `keepVersion`,
   * upholding the one-current-per-slug invariant.
   */
  // void-ok
  clearOtherCurrents(slug: string, keepVersion: string): Promise<void>;

  /** Append one consent transition to a user's history. */
  recordConsent(params: RecordConsentParams): Promise<UserConsentView>;

  /** The latest consent transition for (user, slug), if any. */
  findLatestConsent(
    userId: number,
    slug: string,
  ): Promise<UserConsentView | undefined>;

  /** Full consent history for a user, newest first. */
  findConsentsForUser(userId: number): Promise<UserConsentView[]>;
}

export const DOCUMENT_STORE = Symbol('DOCUMENT_STORE');
