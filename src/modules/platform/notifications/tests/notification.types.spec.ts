import {
  plainText,
  resolveLocalizedText,
} from '../interfaces/notification.types';

describe('resolveLocalizedText', () => {
  it('returns the per-locale override when present', () => {
    expect(
      resolveLocalizedText(
        { default: 'Hello', byLocale: { de: 'Hallo' } },
        'de',
      ),
    ).toBe('Hallo');
  });

  it('falls back to default when the locale has no override', () => {
    expect(
      resolveLocalizedText(
        { default: 'Hello', byLocale: { de: 'Hallo' } },
        'fr',
      ),
    ).toBe('Hello');
  });

  it('falls back to default when there is no byLocale map', () => {
    expect(resolveLocalizedText({ default: 'Hello' }, 'en')).toBe('Hello');
  });
});

describe('plainText', () => {
  it('wraps a string as single-locale LocalizedText', () => {
    expect(plainText('Hi')).toEqual({ default: 'Hi' });
  });
});
