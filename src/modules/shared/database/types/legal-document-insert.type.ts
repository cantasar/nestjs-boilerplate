import { legalDocuments } from '../schema/legal-document.schema';

export type NewLegalDocument = typeof legalDocuments.$inferInsert;
