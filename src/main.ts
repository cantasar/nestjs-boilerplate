import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use pino logger
  app.useLogger(app.get(Logger));

  // global /api prefix
  app.setGlobalPrefix('api');

  // api version - in the controller decorator @Controller({ version: '1' })
  app.enableVersioning({ type: VersioningType.URI });

  // validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // swwagger
  const config = new DocumentBuilder()
    .setTitle('Template API')
    .setDescription('The Template API description')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // response type
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TransformInterceptor(reflector));

  // exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = app.get(ConfigService).get<number>('PORT') || 3000;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`LIVE: http://localhost:${port}`);
  logger.log(`SWAGGER: http://localhost:${port}/docs`);
}

void bootstrap();
