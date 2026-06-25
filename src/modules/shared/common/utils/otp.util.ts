import { randomInt } from 'node:crypto';

/**
 * Generate a numeric OTP using a cryptographically secure RNG.
 *
 * @param length Number of digits (default 6). Must be 1..10.
 * @returns Zero-padded numeric string of the requested length.
 */
export function generateOtpCode(length: number = 6): string {
  if (!Number.isInteger(length) || length < 1 || length > 10) {
    throw new RangeError(
      `OTP length must be an integer in 1..10, got ${length}`,
    );
  }
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, '0');
}

/**
 * Compute the absolute expiration timestamp for an OTP issued now.
 *
 * @param minutes Validity window in minutes (default 10). Must be > 0.
 */
export function getOtpExpiration(minutes: number = 10): Date {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new RangeError(
      `OTP minutes must be a positive number, got ${minutes}`,
    );
  }
  return new Date(Date.now() + minutes * 60_000);
}
