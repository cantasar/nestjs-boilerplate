import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyAuth } from '../../shared/common/decorators/api-key-auth.decorator';

/**
 * Server-to-server surface, authenticated by `X-API-Key` (not JWT). Reference
 * for wiring `@ApiKeyAuth()` on internal integrations, monitors, or webhooks.
 */
@ApiTags('Internal')
@Controller({ path: 'internal', version: '1' })
export class InternalController {
  @Get('ping')
  @ApiKeyAuth()
  @ApiOperation({
    summary: 'Server-to-server connectivity check (API key auth)',
  })
  @ApiOkResponse({ description: 'Service reachable' })
  ping(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
