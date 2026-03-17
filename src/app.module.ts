import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { DrizzleModule } from './core/db/drizzle.module';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { MailModule } from './core/mail/mail.module';
import { LoggerModule } from 'nestjs-pino';
import { RedisModule } from './core/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    RedisModule,
    DrizzleModule,
    AuthModule,
    MailModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
