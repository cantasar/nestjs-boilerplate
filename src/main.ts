import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import {
  DOCS_PREFIX,
  configureVersioning,
} from './modules/shared/common/config/app-versioning';
import { HttpExceptionFilter } from './modules/shared/common/filters/http-exception.filter';
import { setupSwagger } from './swagger/setup-swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.useLogger(app.get(Logger));

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const bodyParserLimit =
    configService.get<string>('BODY_PARSER_LIMIT') ?? '1mb';
  app.useBodyParser('json', { limit: bodyParserLimit });
  app.useBodyParser('urlencoded', { limit: bodyParserLimit, extended: true });

  // CSP is off because Swagger UI needs inline scripts. Other Helmet headers stay on.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.enableCors({
    origin: resolveCorsOrigin(configService, isProduction),
    credentials: true,
  });

  configureVersioning(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerEnabled = setupSwagger(app, configService, DOCS_PREFIX);

  app.enableShutdownHooks();

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
  const logger = app.get(Logger);
  logger.log(`Server: http://localhost:${port}`);
  if (swaggerEnabled) {
    logger.log(`Swagger UI: http://localhost:${port}/${DOCS_PREFIX}/docs`);
    logger.log(
      `Mobile Swagger UI: http://localhost:${port}/${DOCS_PREFIX}/mobile/docs`,
    );
  }
}

/** CORS_ORIGIN is a comma list. Empty means all origins in dev and none in production. */
function resolveCorsOrigin(
  config: ConfigService,
  isProduction: boolean,
): string[] | boolean {
  const raw = config.get<string>('CORS_ORIGIN')?.trim();
  const list = raw
    ? raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  if (list.length > 0) return list;
  return !isProduction;
}

bootstrap().catch((err: unknown) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
