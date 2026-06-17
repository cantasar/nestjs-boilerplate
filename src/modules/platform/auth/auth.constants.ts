export const AUTH_CONSTANTS = {
  BCRYPT_SALT_ROUNDS: 10,
  FORGOT_PASSWORD_REQUESTS_LIMIT: 3,
  FORGOT_PASSWORD_WINDOW_SECONDS: 60,
  OTP_MIN: 100_000,
  OTP_MAX: 999_999,
} as const;

/**
 * Default config for the OTP / session-based auth flows (email verification,
 * passwordless email login, phone signup + login). Every value is read from the
 * ConfigService with `?? <default>` at call sites, so deployments can override
 * via env without touching code. Keys are English, domain-agnostic.
 */
export const AUTH_OTP_DEFAULTS = {
  // Redis TTL (seconds) for each session kind.
  EMAIL_VERIFY_SESSION_TTL_SECONDS: 900,
  EMAIL_LOGIN_SESSION_TTL_SECONDS: 300,
  PHONE_SESSION_TTL_SECONDS: 180,

  // Max wrong-OTP attempts before a session is burned.
  OTP_MAX_ATTEMPTS: 5,

  // Per-identifier resend rate limit (requests per window).
  RESEND_RATE_LIMIT_MAX: 5,
  RESEND_RATE_LIMIT_WINDOW_SECONDS: 60,
  PHONE_RATE_LIMIT_MAX: 3,
  PHONE_RATE_LIMIT_WINDOW_SECONDS: 60,
} as const;

/** Config keys consumed by the OTP/session auth flows. */
export const AUTH_CONFIG_KEYS = {
  EMAIL_VERIFY_SESSION_TTL_SECONDS: 'AUTH_EMAIL_VERIFY_SESSION_TTL_SECONDS',
  EMAIL_LOGIN_SESSION_TTL_SECONDS: 'AUTH_EMAIL_LOGIN_SESSION_TTL_SECONDS',
  PHONE_SESSION_TTL_SECONDS: 'AUTH_PHONE_SESSION_TTL_SECONDS',
  OTP_MAX_ATTEMPTS: 'AUTH_OTP_MAX_ATTEMPTS',
  RESEND_RATE_LIMIT_MAX: 'AUTH_RESEND_RATE_LIMIT_MAX',
  RESEND_RATE_LIMIT_WINDOW_SECONDS: 'AUTH_RESEND_RATE_LIMIT_WINDOW_SECONDS',
  PHONE_RATE_LIMIT_MAX: 'AUTH_PHONE_RATE_LIMIT_MAX',
  PHONE_RATE_LIMIT_WINDOW_SECONDS: 'AUTH_PHONE_RATE_LIMIT_WINDOW_SECONDS',
  /** When 'true', OTPs are echoed in the response body (local/dev only). */
  DEBUG_RETURN_OTP: 'AUTH_DEBUG_RETURN_OTP',
} as const;

/** Redis key prefixes for OTP sessions, attempt counters and rate limits. */
export const AUTH_REDIS_KEYS = {
  emailVerifySession: (token: string): string => `email_verify:${token}`,
  emailLoginSession: (token: string): string => `email_login:${token}`,
  phoneSession: (token: string): string => `phone_session:${token}`,
  attempts: (sessionKey: string): string => `${sessionKey}:attempts`,
  emailVerifyResendLimit: (email: string): string =>
    `limit:email_verify_otp:${email}`,
  emailLoginLimit: (email: string): string => `limit:email_login_otp:${email}`,
  phoneOtpLimit: (phone: string): string => `limit:phone_otp:${phone}`,
} as const;
