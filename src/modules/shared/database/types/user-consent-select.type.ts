import { userConsents } from '../schema/user-consent.schema';

export type UserConsent = typeof userConsents.$inferSelect;
