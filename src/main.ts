import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { setupSwagger } from './swagger/setup-swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const apiPrefix = 'api';
  app.useLogger(app.get(Logger));
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN')?.split(',') ?? true,
    credentials: true,
  });
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', 'health/ready'],
  });
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  const swaggerEnabled = setupSwagger(app, configService, {
    apiPrefix,
  });
  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
  const logger = app.get(Logger);
  logger.log(`Server: http://localhost:${port}`);
  if (swaggerEnabled) {
    logger.log(`Swagger UI: http://localhost:${port}/${apiPrefix}/docs`);
    logger.log(
      `OpenAPI JSON: http://localhost:${port}/${apiPrefix}/docs/openapi.json`,
    );
    const basicUser = configService.get<string>('SWAGGER_BASIC_AUTH_USER');
    if (basicUser?.trim()) {
      logger.log('Swagger: protected with HTTP Basic Auth');
    }
  }
}

void bootstrap();
