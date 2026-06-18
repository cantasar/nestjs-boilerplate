/** Named job type within the SMS queue. */
export const SMS_OTP_JOB = 'otp';

/** Payload for an OTP SMS job. The message is templated in the processor. */
export interface SmsOtpJob {
  to: string;
  otp: string;
}
