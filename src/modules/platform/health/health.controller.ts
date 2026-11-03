import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { DATABASE_TOKENS } from '../../shared/database/database.tokens';
import type { Pool } from 'pg';
import { RedisService } from '../../shared/redis/redis.service';
import { Public } from '../../shared/common/decorators/public.decorator';
import { RawResponse } from '../../shared/common/decorators/raw-response.decorator';

@ApiExcludeController()
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE_POOL) private readonly pool: Pool,
    private readonly redisService: RedisService,
  ) {}

  // Liveness: used to decide restarts, so it does not check dependencies.
  @Get('live')
  live(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // Same light check as liveness, at the root `/health` path.
  @Get()
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // Readiness: checks DB and Redis before the service gets traffic.
  // RawResponse skips the envelope, which would say `success: true` on a 503.
  @Get('ready')
  @RawResponse()
  async ready(@Res({ passthrough: true }) res: Response): Promise<{
    status: string;
    checks: Record<string, string>;
    timestamp: string;
  }> {
    const checks: Record<string, string> = {};
    try {
      await this.pool.query('SELECT 1');
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }
    try {
      await this.redisService.ping();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    }
    const allUp = Object.values(checks).every((v) => v === 'up');
    if (!allUp) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: allUp ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
