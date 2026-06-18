/**
 * Generic legal-document categories. Placeholder values — a consuming app
 * relabels / extends these to fit its own document taxonomy. Stored as a plain
 * `varchar` (not a Postgres enum) on `legal_documents.type` so apps can add
 * categories without a schema migration; only `LEGAL_CONSENT` docs participate
 * in the consent flow.
 */
export enum DocumentType {
  /** Consent-gated legal text (terms, privacy) — drives the consent flow. */
  LEGAL_CONSENT = 'legal_consent',
  /** Other informational documents shown in-app, not consent-gated. */
  INFORMATIONAL = 'informational',
}
