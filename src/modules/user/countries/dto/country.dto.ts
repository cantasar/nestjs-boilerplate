import { ApiProperty } from '@nestjs/swagger';

/**
 * A single ISO 3166-1 country with its primary IANA timezone and a flag URL.
 * Returned by `GET /countries` (search-filtered list) and `GET /countries/:code`.
 */
export class CountryDto {
  @ApiProperty({ example: 'Turkey' })
  readonly name!: string;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code',
    example: 'TR',
  })
  readonly code!: string;

  @ApiProperty({
    description:
      'Primary IANA timezone for the country (capital or most populous city)',
    example: 'Europe/Istanbul',
  })
  readonly timezone!: string;

  @ApiProperty({
    description: 'Public CDN URL for the country flag (w320, PNG)',
    example: 'https://flagcdn.com/w320/tr.png',
  })
  readonly flagUrl!: string;
}
