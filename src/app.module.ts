import { Module, RequestMethod, type OnModuleDestroy } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './modules/shared/common/config/env.validation';
import { JwtAuthGuard } from './modules/shared/common/guards/jwt.guard';
import { CommonModule } from './modules/shared/common/common.module';
import { ResponseTransformInterceptor } from './modules/shared/common/interceptors/response-transform.interceptor';
import { CacheInterceptor } from './modules/shared/common/interceptors/cache.interceptor';
import { AuditModule } from './modules/shared/common/audit/audit.module';
import { AuditContextInterceptor } from './modules/shared/common/audit/audit-context.interceptor';
import { AuditInterceptor } from './modules/shared/common/audit/audit.interceptor';
import { DatabaseModule } from './modules/shared/database/database.module';
import { RedisModule } from './modules/shared/redis/redis.module';
import { AuthModule } from './modules/platform/auth/auth.module';
import { QueueModule } from './modules/platform/queue/queue.module';
import { ExampleQueueModule } from './modules/platform/queue/example/example-queue.module';
import { EventsModule } from './modules/platform/events/events.module';
import { MailModule } from './modules/platform/mail/mail.module';
import { SmsModule } from './modules/platform/sms/sms.module';
import { StorageModule } from './modules/platform/storage/storage.module';
import { MediaModule } from './modules/platform/media/media.module';
import { NotificationsModule } from './modules/platform/notifications/notifications.module';
import { TodosModule } from './modules/_template/todo/todos.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthenticatedConsentModule } from './modules/user/consent/authenticated-consent.module';
import { PublicLegalDocumentsModule } from './modules/user/legal-documents/public-legal-documents.module';
import { HealthModule } from './modules/platform/health/health.module';
import { CountriesModule } from './modules/user/countries/countries.module';

// Dedicated throttler ioredis connection, created in the factory and held here
// so AppModule can close it on shutdown (ThrottlerStorageRedisService does not
// own/close a connection passed to it) — avoids a leak on teardown/test reboots.
let throttlerRedis: Redis | undefined;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: false,
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
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('RATE_LIMIT_TTL'),
            limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
          },
        ],
        // Redis-backed storage so rate limits stay consistent across pods.
        // Own the ioredis instance (keyPrefix isolates throttle keys from the
        // shared REDIS_CLIENT namespace) so it can be closed on shutdown.
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
    AuditModule,
    RedisModule,
    QueueModule,
    ExampleQueueModule,
    EventsModule,
    StorageModule,
    MediaModule,
    MailModule,
    SmsModule,
    NotificationsModule,
    AuthModule,
    TodosModule,
    AdminModule,
    AuthenticatedConsentModule,
    PublicLegalDocumentsModule,
    HealthModule,
    CountriesModule,
  ],
  providers: [
    {
      // Wrap every success response in the v1 envelope. Registered first so it
      // sits OUTERMOST among interceptors — the audit interceptors below run
      // closer to the handler and see the RAW result (the domain object/DTO),
      // not the `{ success, data }` envelope this applies.
      provide: APP_INTERCEPTOR,
      useClass: ResponseTransformInterceptor,
    },
    {
      // Establish the per-request audit context (actor/request id/timestamp).
      // Registered after the envelope (inside it) and before AuditInterceptor so
      // the context is populated by the time a snapshot is written.
      provide: APP_INTERCEPTOR,
      useExisting: AuditContextInterceptor,
    },
    {
      // Capture before/after snapshots for @Audit handlers and hand them to the
      // AuditSink. Innermost interceptor → observes the raw handler result.
      provide: APP_INTERCEPTOR,
      useExisting: AuditInterceptor,
    },
    {
      // Innermost interceptor: caches/serves the raw handler result for
      // @Cacheable handlers (and evicts for @CacheEvict), before the outer
      // interceptors envelope it. No-op for undecorated routes.
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
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
export class AppModule implements OnModuleDestroy {
  // void-ok: closes the dedicated throttler connection on shutdown.
  async onModuleDestroy(): Promise<void> {
    if (throttlerRedis) {
      await throttlerRedis.quit();
      throttlerRedis = undefined;
    }
  }
}
