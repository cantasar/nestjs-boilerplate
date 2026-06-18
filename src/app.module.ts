import { Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './modules/shared/common/config/env.validation';
import { JwtAuthGuard } from './modules/shared/common/guards/jwt.guard';
import { CommonModule } from './modules/shared/common/common.module';
import { ResponseTransformInterceptor } from './modules/shared/common/interceptors/response-transform.interceptor';
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
