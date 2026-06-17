import { randomInt } from 'node:crypto';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT = '0123456789';
const SPECIAL = '!@#$%^&*';
const ALL = LOWER + UPPER + DIGIT + SPECIAL;
const LENGTH = 16;

function pick(set: string): string {
  return set[randomInt(set.length)]!;
}

/**
 * Cryptographically-random password guaranteed to contain at least one lower,
 * upper, digit and special char. Used for admin-issued temporary passwords.
 */
export function generateStrongPassword(): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SPECIAL)];
  while (chars.length < LENGTH) chars.push(pick(ALL));
  // Fisher–Yates shuffle so the guaranteed chars aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
