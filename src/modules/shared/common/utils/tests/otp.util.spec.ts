import * as otpUtil from '../otp.util';
import { generateOtpCode } from '../otp.util';

describe('generateOtpCode', () => {
  it('returns a string of the requested length by default (6)', () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('respects custom length and zero-pads short codes', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode(4);
      expect(code).toMatch(/^\d{4}$/);
      expect(code.length).toBe(4);
    }
  });

  it('produces different values across calls (sanity, not strict)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(generateOtpCode(8));
    }
    expect(seen.size).toBeGreaterThan(150);
  });

  it('can start with a zero (the whole range is used)', () => {
    let sawLeadingZero = false;
    for (let i = 0; i < 2000 && !sawLeadingZero; i++) {
      sawLeadingZero = generateOtpCode(2).startsWith('0');
    }
    expect(sawLeadingZero).toBe(true);
  });

  it.each([0, -1, 11, 1.5, Number.NaN])(
    'rejects invalid length %p',
    (value) => {
      expect(() => generateOtpCode(value)).toThrow(RangeError);
    },
  );

  // L12: the unused expiry helper was removed.
  it('exports only generateOtpCode', () => {
    expect(Object.keys(otpUtil)).toEqual(['generateOtpCode']);
  });
});
