import { legalDocuments } from '../schema/legal-document.schema';

export type LegalDocument = typeof legalDocuments.$inferSelect;
