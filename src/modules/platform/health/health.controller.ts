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

  // Liveness: process is up. No dependency checks — used by orchestrators to
  // decide whether to restart the container.
  @Get('live')
  live(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // General health: same lightweight signal as liveness, mounted at the root
  // `/health` path for convenience.
  @Get()
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // Readiness: verifies downstream dependencies (DB + Redis) before the service
  // is allowed to receive traffic.
  // RawResponse: this endpoint sets its own status (503 when degraded) and
  // returns a diagnostic body, so it must bypass the success-envelope
  // interceptor (which would otherwise emit `success: true` on a 503).
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
