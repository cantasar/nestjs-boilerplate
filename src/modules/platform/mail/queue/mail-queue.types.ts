/** One arm per mail template. Job data is JSON, so dates travel as strings; `code` is part of the dedup key. */
export type MailJob =
  | { template: 'verify-email'; to: string; code: string }
  | { template: 'password-reset'; to: string; code: string };
