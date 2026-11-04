import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyAuth } from '../../shared/common/decorators/api-key-auth.decorator';
import { ApiOkEnvelope } from '../../shared/common/decorators/api-common-responses.decorator';
import { PingResponseDto } from './dto/ping-response.dto';

/** Server-to-server routes, authenticated by `X-API-Key` instead of JWT. */
@ApiTags('Internal')
@Controller({ path: 'internal', version: '1' })
export class InternalController {
  @Get('ping')
  @ApiKeyAuth()
  @ApiOperation({
    summary: 'Server-to-server connectivity check (API key auth)',
  })
  @ApiOkEnvelope(PingResponseDto, { description: 'Service reachable' })
  ping(): PingResponseDto {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
