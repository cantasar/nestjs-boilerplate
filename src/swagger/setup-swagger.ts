import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import { createSwaggerBasicAuthMiddleware } from './swagger-basic-auth.middleware';

const SWAGGER_PATH = 'docs' as const;

export function setupSwagger(
  app: INestApplication,
  configService: ConfigService,
  options: { readonly apiPrefix: string },
): boolean {
  if (configService.get<string>('SWAGGER_ENABLED') === 'false') {
    return false;
  }
  const isProduction =
    (configService.get<string>('NODE_ENV') ?? 'development') === 'production';
  const basicUser = configService
    .get<string>('SWAGGER_BASIC_AUTH_USER')
    ?.trim();
  const basicPassword = configService
    .get<string>('SWAGGER_BASIC_AUTH_PASSWORD')
    ?.trim();
  if (isProduction && (!basicUser || !basicPassword)) {
    throw new Error(
      'Production requires SWAGGER_BASIC_AUTH_USER and SWAGGER_BASIC_AUTH_PASSWORD.',
    );
  }
  const swaggerBase = `/${options.apiPrefix}/${SWAGGER_PATH}`;
  if (basicUser && basicPassword) {
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    expressApp.use(
      swaggerBase,
      createSwaggerBasicAuthMiddleware(basicUser, basicPassword),
    );
  }
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('NestJS Boilerplate API')
      .setDescription(
        'REST API with JWT auth, todos, and health. Use **Authorize** with a Bearer token from login or register.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .build(),
    { deepScanRoutes: true },
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    useGlobalPrefix: true,
    customSiteTitle: 'NestJS Boilerplate API',
    jsonDocumentUrl: 'docs/openapi.json',
    yamlDocumentUrl: 'docs/openapi.yaml',
    swaggerOptions: {
      persistAuthorization: true,
      filter: true,
      displayRequestDuration: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
  return true;
}
