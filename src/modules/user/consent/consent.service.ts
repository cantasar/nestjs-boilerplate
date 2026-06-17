import { Inject, Injectable } from '@nestjs/common';
import { ConsentStatus } from '../../shared/database/schema/enums/consent-status.enum';
import { DomainException } from '../../shared/common/errors/domain.exception';
import { LegalDocumentErrorCode } from '../../shared/common/errors/error-codes';
import {
  DOCUMENT_STORE,
  type DocumentStore,
} from './interfaces/document-store.interface';
import type {
  RecordConsentParams,
  UserConsentView,
} from './interfaces/consent.types';

/** Optional request context captured alongside a consent transition. */
interface ConsentContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Authenticated consent flow over the {@link DocumentStore} port. Each accept /
 * revoke appends an immutable history row after verifying the (slug, version)
 * the user acted on actually exists.
 */
@Injectable()
export class ConsentService {
  constructor(@Inject(DOCUMENT_STORE) private readonly store: DocumentStore) {}

  accept(
    userId: number,
    documentSlug: string,
    documentVersion: string,
    context?: ConsentContext,
  ): Promise<UserConsentView> {
    return this.record(
      userId,
      documentSlug,
      documentVersion,
      ConsentStatus.ACCEPTED,
      context,
    );
  }

  revoke(
    userId: number,
    documentSlug: string,
    documentVersion: string,
    context?: ConsentContext,
  ): Promise<UserConsentView> {
    return this.record(
      userId,
      documentSlug,
      documentVersion,
      ConsentStatus.REVOKED,
      context,
    );
  }

  findLatest(
    userId: number,
    slug: string,
  ): Promise<UserConsentView | undefined> {
    return this.store.findLatestConsent(userId, slug);
  }

  listForUser(userId: number): Promise<UserConsentView[]> {
    return this.store.findConsentsForUser(userId);
  }

  private async record(
    userId: number,
    documentSlug: string,
    documentVersion: string,
    status: ConsentStatus,
    context?: ConsentContext,
  ): Promise<UserConsentView> {
    const document = await this.store.findByVersion(
      documentSlug,
      documentVersion,
    );
    if (!document) {
      throw new DomainException(LegalDocumentErrorCode.NOT_FOUND_BY_SLUG, {
        params: { slug: documentSlug },
      });
    }
    const params: RecordConsentParams = {
      userId,
      documentSlug,
      documentVersion,
      status,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
    };
    return this.store.recordConsent(params);
  }
}
