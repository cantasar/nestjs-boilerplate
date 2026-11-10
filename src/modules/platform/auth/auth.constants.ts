export const AUTH_CONSTANTS = {
  BCRYPT_SALT_ROUNDS: 12,
  FORGOT_PASSWORD_REQUESTS_LIMIT: 3,
  FORGOT_PASSWORD_WINDOW_SECONDS: 60,
  // Own constant on purpose, so tuning a cache TTL never changes this security window.
  PASSWORD_RESET_CODE_TTL_SECONDS: 900,
  // Wrong email codes (reset and verify) per email per day. New codes do not reset it, so guessing cannot go on.
  CODE_FAILURE_LIMIT: 10,
  CODE_FAILURE_WINDOW_SECONDS: 86_400,
  // Reset and verify mails per email per day, so nobody can flood an inbox.
  CODE_MAILS_PER_DAY: 10,
  CODE_MAIL_WINDOW_SECONDS: 86_400,
} as const;

/** Strict per-IP limit for login, register and password routes (stops password guessing). */
export const AUTH_THROTTLE = {
  default: { limit: 5, ttl: 60_000 },
} as const;

/** Defaults for the email verification flow. Each one can be overridden by its env key below. */
export const AUTH_OTP_DEFAULTS = {
  EMAIL_VERIFY_SESSION_TTL_SECONDS: 900,
  OTP_MAX_ATTEMPTS: 5,
  RESEND_RATE_LIMIT_MAX: 5,
  RESEND_RATE_LIMIT_WINDOW_SECONDS: 60,
} as const;

export const AUTH_CONFIG_KEYS = {
  EMAIL_VERIFY_SESSION_TTL_SECONDS: 'AUTH_EMAIL_VERIFY_SESSION_TTL_SECONDS',
  OTP_MAX_ATTEMPTS: 'AUTH_OTP_MAX_ATTEMPTS',
  RESEND_RATE_LIMIT_MAX: 'AUTH_RESEND_RATE_LIMIT_MAX',
  RESEND_RATE_LIMIT_WINDOW_SECONDS: 'AUTH_RESEND_RATE_LIMIT_WINDOW_SECONDS',
  /** When 'true', OTPs are returned in the response body (never in production). */
  DEBUG_RETURN_OTP: 'AUTH_DEBUG_RETURN_OTP',
} as const;

export const AUTH_REDIS_KEYS = {
  emailVerifySession: (token: string): string => `email_verify:${token}`,
  attempts: (sessionKey: string): string => `${sessionKey}:attempts`,
  emailVerifyResendLimit: (email: string): string =>
    `limit:email_verify_otp:${email}`,
  forgotPasswordLimit: (email: string): string => `limit:forgot:${email}`,
  codeFailures: (email: string): string => `limit:code_fail:${email}`,
  codeMailsPerDay: (email: string): string => `limit:code_mail:${email}`,
  resetPassword: (email: string): string => `reset_pass:${email}`,
} as const;
