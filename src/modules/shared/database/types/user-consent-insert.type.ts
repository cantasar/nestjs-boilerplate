import { userConsents } from '../schema/user-consent.schema';

export type NewUserConsent = typeof userConsents.$inferInsert;
