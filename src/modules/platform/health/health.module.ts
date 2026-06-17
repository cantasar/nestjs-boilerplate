import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from '../../shared/database/database.module';
import { RedisModule } from '../../shared/redis/redis.module';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
