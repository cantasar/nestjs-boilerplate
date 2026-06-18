/**
 * Shapes for the OTP/session-based auth flows. These are the JSON payloads
 * stored in Redis under the session keys defined in `auth.constants.ts`. Each
 * carries a discriminating `type` so a session minted for one flow can never be
 * replayed against another verify endpoint.
 */

export interface EmailVerifySession {
  type: 'email_verify';
  email: string;
  userId: number;
  otp: string;
}

export interface EmailLoginSession {
  type: 'email_login';
  email: string;
  userId: number;
  otp: string;
}

export interface PhoneRegisterSession {
  type: 'phone_register';
  phone: string;
  hashedPassword: string;
  otp: string;
}

export interface PhoneLoginSession {
  type: 'phone_login';
  phone: string;
  userId: number;
  otp: string;
}

export type PhoneSession = PhoneRegisterSession | PhoneLoginSession;
