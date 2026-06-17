/**
 * Provider-agnostic SMS port. Consumers inject the `SMS_SENDER` token, never a
 * concrete provider class, so the HTTP/Twilio/etc. backend can be swapped behind
 * the token without touching callers. A failed send throws so the SMS queue
 * worker retries with backoff.
 */
export interface SmsSender {
  send(to: string, message: string): Promise<void>; // void-ok
}

export const SMS_SENDER = Symbol('SMS_SENDER');
