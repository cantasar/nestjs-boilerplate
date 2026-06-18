/**
 * Mail jobs are discriminated by `template`. Job data is JSON-serialized by
 * BullMQ, so any non-primitive field (e.g. dates) must travel as a string and be
 * re-hydrated in the processor. Add a new arm here + a case in the processor's
 * switch to register a new templated mail.
 *
 * Every arm carries an OTP-like `code` so the processor can build a safe dedup
 * key (`to` + `code`). Templates that are not code-bearing should not be deduped.
 */
export type MailJob =
  | { template: 'otp'; to: string; code: string }
  | { template: 'verify-email'; to: string; code: string }
  | { template: 'password-reset'; to: string; code: string };
