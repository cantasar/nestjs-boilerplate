import { Module, RequestMethod, type OnModuleDestroy } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './modules/shared/common/config/env.validation';
import { JwtAuthGuard } from './modules/shared/common/guards/jwt.guard';
import { RolesGuard } from './modules/shared/common/guards/roles.guard';
import { CommonModule } from './modules/shared/common/common.module';
import { ResponseTransformInterceptor } from './modules/shared/common/interceptors/response-transform.interceptor';
import { DatabaseModule } from './modules/shared/database/database.module';
import { RedisModule } from './modules/shared/redis/redis.module';
import { AuthModule } from './modules/platform/auth/auth.module';
import { QueueModule } from './modules/platform/queue/queue.module';
import { MailModule } from './modules/platform/mail/mail.module';
import { HealthModule } from './modules/platform/health/health.module';
import { InternalModule } from './modules/platform/internal/internal.module';
import { SeedsModule } from './modules/platform/seeds/seeds.module';
import { TodosModule } from './modules/_template/todo/todos.module';

// Own Redis connection for the throttler, kept here so it can be closed on shutdown.
let throttlerRedis: Redis | undefined;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // main.ts and migrate.ts load .env (load-env.ts), so tests never pick up a local .env.
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
      pinoHttp: {
        // Tokens, API keys and cookies never reach the logs.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'res.headers["set-cookie"]',
          ],
          censor: '[redacted]',
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('RATE_LIMIT_TTL'),
            limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
          },
        ],
        // Redis storage keeps limits shared across pods. The key prefix keeps them apart from other keys.
        storage: new ThrottlerStorageRedisService(
          (throttlerRedis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
            keyPrefix: config.getOrThrow<string>('RATE_LIMIT_REDIS_PREFIX'),
          })),
        ),
      }),
      inject: [ConfigService],
    }),
    CommonModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    MailModule,
    AuthModule,
    HealthModule,
    InternalModule,
    SeedsModule,
    TodosModule,
  ],
  providers: [
    // Wraps every success response in the v1 envelope.
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Fail-closed: every route needs a valid JWT unless it is marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Runs after the JWT guard, so `@Roles()` can read `request.user.role`.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    if (throttlerRedis) {
      await throttlerRedis.quit();
      throttlerRedis = undefined;
    }
  }
}
