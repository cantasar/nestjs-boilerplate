import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainException } from '../../shared/common/errors/domain.exception';
import { CommonErrorCode } from '../../shared/common/errors/error-codes';
import { CountriesService } from './countries.service';
import { CountryDto } from './dto/country.dto';

@ApiTags('Countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List countries',
    description:
      'Returns the ISO 3166-1 catalogue. Optionally filtered by name.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Case-insensitive partial match on country name',
  })
  @ApiResponse({ status: 200, type: CountryDto, isArray: true })
  list(@Query('search') search?: string): readonly CountryDto[] {
    return search
      ? this.countriesService.search(search)
      : this.countriesService.getAll();
  }

  @Get(':code')
  @ApiOperation({
    summary: 'Get a country by ISO 3166-1 alpha-2 code',
    description: 'Returns 404 (`COMMON_NOT_FOUND`) when the code is unknown.',
  })
  @ApiResponse({ status: 200, type: CountryDto })
  getByCode(@Param('code') code: string): CountryDto {
    const country = this.countriesService.getByCode(code);
    if (!country) {
      throw new DomainException(CommonErrorCode.NOT_FOUND);
    }
    return country;
  }
}
