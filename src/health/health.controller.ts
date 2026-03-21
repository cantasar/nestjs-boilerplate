import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { DATABASE_TOKENS } from '../database/database.tokens';
import type { Pool } from 'pg';
import { RedisService } from '../redis/redis.service';

/** Health check endpoints for liveness and readiness (infra; omitted from OpenAPI). */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE_TOKENS.DRIZZLE_POOL) private readonly pool: Pool,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  live(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
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
