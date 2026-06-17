import type { ConsentStatus } from '../../../shared/database/schema/enums/consent-status.enum';

/** A published legal-document row as returned by the document store. */
export interface LegalDocumentView {
  id: number;
  slug: string;
  version: string;
  type: string;
  title: Record<string, string>;
  content: Record<string, string>;
  publishedAt: Date;
  isCurrent: boolean;
}

/** A single consent-history row (one immutable accept/revoke transition). */
export interface UserConsentView {
  id: number;
  userId: number;
  documentSlug: string;
  documentVersion: string;
  status: ConsentStatus;
  changedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

/** Payload to append one consent transition to a user's history. */
export interface RecordConsentParams {
  userId: number;
  documentSlug: string;
  documentVersion: string;
  status: ConsentStatus;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Payload to upsert a published legal-document version. */
export interface UpsertDocumentParams {
  slug: string;
  version: string;
  type: string;
  title: Record<string, string>;
  content: Record<string, string>;
  isCurrent: boolean;
}
