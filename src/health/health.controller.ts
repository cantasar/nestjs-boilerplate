import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { DRIZZLE_POOL } from '../database/database.module';
import type { Pool } from 'pg';
import type Redis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DRIZZLE_POOL) private readonly pool: Pool,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Get()
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks: Record<string, string> = {};

    try {
      await this.pool.query('SELECT 1');
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    try {
      await this.redis.ping();
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
