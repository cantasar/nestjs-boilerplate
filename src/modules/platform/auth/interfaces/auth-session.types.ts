/** Email verification session stored in Redis. `type` stops a session from being used by another flow. */
export interface EmailVerifySession {
  type: 'email_verify';
  email: string;
  userId: number;
  otp: string;
}
