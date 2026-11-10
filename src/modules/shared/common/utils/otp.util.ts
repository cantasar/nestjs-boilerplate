import { randomInt } from 'node:crypto';

/** Generates a zero-padded numeric OTP using a crypto-secure RNG. */
export function generateOtpCode(length: number = 6): string {
  if (!Number.isInteger(length) || length < 1 || length > 10) {
    throw new RangeError(
      `OTP length must be an integer in 1..10, got ${length}`,
    );
  }
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, '0');
}
