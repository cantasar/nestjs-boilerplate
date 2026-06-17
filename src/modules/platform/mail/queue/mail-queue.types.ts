/**
 * Mail jobs are discriminated by `template`. Job data is JSON-serialized by
 * BullMQ, so any non-primitive field (e.g. dates) must travel as a string and be
 * re-hydrated in the processor. Add a new arm here + a case in the processor's
 * switch to register a new templated mail.
 */
export type MailJob = { template: 'otp'; to: string; otp: string };
