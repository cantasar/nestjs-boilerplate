import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Generic consent lifecycle states. Placeholder values — a consuming app that
 * needs finer states (e.g. `pending`, `expired`) adds them here. The consent
 * history table is append-only, so each row is one immutable transition.
 */
export enum ConsentStatus {
  ACCEPTED = 'accepted',
  REVOKED = 'revoked',
}

export const consentStatusEnum = pgEnum(
  'consent_status',
  Object.values(ConsentStatus) as [ConsentStatus, ...ConsentStatus[]],
);
