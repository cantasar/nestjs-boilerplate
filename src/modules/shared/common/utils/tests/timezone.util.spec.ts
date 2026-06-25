import {
  getCurrentTimeInTimezone,
  getTimezoneOffsetMinutes,
  isValidTimezone,
  listSupportedTimezones,
} from '../timezone.util';

describe('isValidTimezone', () => {
  it.each(['Europe/Istanbul', 'America/New_York', 'UTC', 'Asia/Tokyo'])(
    'accepts %s',
    (value) => {
      expect(isValidTimezone(value)).toBe(true);
    },
  );

  it.each(['', '   ', 'Not/A_Zone', 'Asia/Atlantis'])('rejects %s', (value) => {
    expect(isValidTimezone(value)).toBe(false);
  });
});

describe('listSupportedTimezones', () => {
  it('returns a non-empty list containing a major city', () => {
    const all = listSupportedTimezones();
    expect(all.length).toBeGreaterThan(300);
    expect(all).toContain('Europe/Istanbul');
    expect(all).toContain('America/New_York');
  });
});

describe('getCurrentTimeInTimezone', () => {
  it('returns a Date whose hour reflects the target zone', () => {
    const istanbul = getCurrentTimeInTimezone('Europe/Istanbul');
    const utc = getCurrentTimeInTimezone('UTC');
    expect(istanbul).toBeInstanceOf(Date);
    expect(utc).toBeInstanceOf(Date);
    // Istanbul is always ahead of UTC (UTC+3, no DST). The local-Date hour
    // representation will differ by 3 unless midnight crossover lines up.
    const diff = (istanbul.getHours() - utc.getHours() + 24) % 24;
    expect(diff).toBe(3);
  });

  it('falls back to UTC for invalid input', () => {
    const fallback = getCurrentTimeInTimezone('Not/A_Zone');
    const utc = getCurrentTimeInTimezone('UTC');
    expect(Math.abs(fallback.getTime() - utc.getTime())).toBeLessThan(2_000);
  });
});

describe('getTimezoneOffsetMinutes', () => {
  it('returns +180 for Istanbul (UTC+3, no DST)', () => {
    const at = new Date('2026-06-21T12:00:00Z');
    expect(getTimezoneOffsetMinutes('Europe/Istanbul', at)).toBe(180);
  });

  it('returns 0 for UTC', () => {
    expect(getTimezoneOffsetMinutes('UTC')).toBe(0);
  });

  it('returns 0 for invalid timezone', () => {
    expect(getTimezoneOffsetMinutes('Not/A_Zone')).toBe(0);
  });

  it('handles DST in New York', () => {
    const summer = new Date('2026-07-15T12:00:00Z'); // EDT, UTC-4
    const winter = new Date('2026-01-15T12:00:00Z'); // EST, UTC-5
    expect(getTimezoneOffsetMinutes('America/New_York', summer)).toBe(-240);
    expect(getTimezoneOffsetMinutes('America/New_York', winter)).toBe(-300);
  });
});
