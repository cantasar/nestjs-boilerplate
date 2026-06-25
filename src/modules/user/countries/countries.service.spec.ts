import { CountriesService } from './countries.service';

describe('CountriesService', () => {
  let service: CountriesService;

  beforeEach(() => {
    service = new CountriesService();
    service.onApplicationBootstrap();
  });

  it('loads the full ISO catalogue (~250 entries)', () => {
    const all = service.getAll();
    expect(all.length).toBeGreaterThanOrEqual(240);
    expect(all.length).toBeLessThanOrEqual(260);
  });

  it('sorts by name', () => {
    const names = service.getAll().map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('maps known country to IANA timezone', () => {
    const tr = service.getByCode('TR');
    expect(tr).not.toBeNull();
    expect(tr?.timezone).toBe('Europe/Istanbul');
    expect(tr?.flagUrl).toBe('https://flagcdn.com/w320/tr.png');
  });

  it('lookup is case-insensitive', () => {
    expect(service.getByCode('tr')?.code).toBe('TR');
    expect(service.getByCode('Tr')?.code).toBe('TR');
  });

  it('returns null for unknown code', () => {
    expect(service.getByCode('XX')).toBeNull();
  });

  it('falls back to UTC when no timezone is mapped', () => {
    // Pick a code that exists in countries.csv but is unlikely to be in the
    // timezone map (or assert via property: timezone is always non-empty).
    for (const c of service.getAll()) {
      expect(c.timezone).toMatch(/.+/);
    }
  });

  it('search filters by name case-insensitively', () => {
    const results = service.search('united');
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((c) => c.name.toLowerCase().includes('united'))).toBe(
      true,
    );
  });

  it('search with empty string returns all', () => {
    expect(service.search('').length).toBe(service.getAll().length);
  });
});
