import { generateOtpCode, getOtpExpiration } from '../otp.util';

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

  it.each([0, -1, 11, 1.5, Number.NaN])(
    'rejects invalid length %p',
    (value) => {
      expect(() => generateOtpCode(value)).toThrow(RangeError);
    },
  );
});

describe('getOtpExpiration', () => {
  it('returns a Date roughly minutes in the future', () => {
    const before = Date.now();
    const exp = getOtpExpiration(10);
    const diff = exp.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(10 * 60_000 - 50);
    expect(diff).toBeLessThanOrEqual(10 * 60_000 + 50);
  });

  it('defaults to 10 minutes when called without arguments', () => {
    const before = Date.now();
    const exp = getOtpExpiration();
    expect(exp.getTime() - before).toBeGreaterThanOrEqual(10 * 60_000 - 50);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid minutes %p',
    (value) => {
      expect(() => getOtpExpiration(value)).toThrow(RangeError);
    },
  );
});
