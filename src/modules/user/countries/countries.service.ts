import {
  Injectable,
  type OnApplicationBootstrap,
  Logger,
} from '@nestjs/common';
import { COUNTRIES_DATA } from './data/countries.data';
import { getTimezoneFromCountry } from './data/country-timezone.data';
import { CountryDto } from './dto/country.dto';

/**
 * Loads the ISO 3166-1 country catalog into memory at boot and exposes
 * search + by-code lookups. Lookups are O(n) over ~250 entries; well under
 * a millisecond and keeps the surface dependency-free.
 */
@Injectable()
export class CountriesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CountriesService.name);
  private countries: readonly CountryDto[] = [];
  private byCode: ReadonlyMap<string, CountryDto> = new Map();

  onApplicationBootstrap(): void {
    const enriched: CountryDto[] = COUNTRIES_DATA.map(({ name, code }) => ({
      name,
      code,
      timezone: getTimezoneFromCountry(code) ?? 'UTC',
      flagUrl: `https://flagcdn.com/w320/${code.toLowerCase()}.png`,
    }));
    enriched.sort((a, b) => a.name.localeCompare(b.name));
    this.countries = enriched;
    this.byCode = new Map(enriched.map((c) => [c.code, c]));
    this.logger.log(`Loaded ${enriched.length} countries into in-memory cache`);
  }

  /** Return every country sorted by name. */
  getAll(): readonly CountryDto[] {
    return this.countries;
  }

  /** Case-insensitive partial match on country name. */
  search(query: string): readonly CountryDto[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return this.countries;
    }
    return this.countries.filter((c) => c.name.toLowerCase().includes(needle));
  }

  /** Look up by ISO 3166-1 alpha-2 code; returns `null` when unknown. */
  getByCode(code: string): CountryDto | null {
    return this.byCode.get(code.toUpperCase()) ?? null;
  }
}
