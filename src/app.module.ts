import { Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './modules/shared/common/config/env.validation';
import { JwtAuthGuard } from './modules/shared/common/guards/jwt.guard';
import { CommonModule } from './modules/shared/common/common.module';
import { DatabaseModule } from './modules/shared/database/database.module';
import { RedisModule } from './modules/shared/redis/redis.module';
import { AuthModule } from './modules/platform/auth/auth.module';
import { TodosModule } from './modules/_template/todo/todos.module';
import { HealthModule } from './modules/platform/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.getOrThrow<number>('RATE_LIMIT_TTL'),
          limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
        },
      ],
      inject: [ConfigService],
    }),
    CommonModule,
    DatabaseModule,
    RedisModule,
    AuthModule,
    TodosModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      // Fail-closed: every route requires a valid JWT unless marked @Public().
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
