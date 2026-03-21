import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';

const DOCS_PATH = 'docs' as const;

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
  options: { readonly apiPrefix: string },
): boolean {
  if (config.get<string>('SWAGGER_ENABLED') === 'false') return false;
  const basicAuth = getBasicAuth(config);
  if (basicAuth) {
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    const basePath = `/${options.apiPrefix.replace(/^\/+|\/+$/g, '')}/${DOCS_PATH}`;
    expressApp.use(basePath, createBasicAuthMiddleware(basicAuth));
    expressApp.use(`${basePath}/`, createBasicAuthMiddleware(basicAuth));
  }
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('NestJS Boilerplate API')
      .setDescription('Production-ready API with JWT auth and todo management.')
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .build(),
    { deepScanRoutes: true },
  );
  SwaggerModule.setup(DOCS_PATH, app, document, {
    useGlobalPrefix: true,
    customSiteTitle: 'NestJS Boilerplate | API Docs',
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      defaultModelsExpandDepth: -1,
      displayRequestDuration: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      filter: true,
    },
  });
  return true;
}

function getBasicAuth(
  config: ConfigService,
): { readonly user: string; readonly pass: string } | null {
  const user = config.get<string>('SWAGGER_BASIC_AUTH_USER')?.trim() ?? '';
  const pass = config.get<string>('SWAGGER_BASIC_AUTH_PASSWORD')?.trim() ?? '';
  if (!user && !pass) return null;
  if (!user || !pass) {
    throw new Error(
      'Both SWAGGER_BASIC_AUTH_USER and SWAGGER_BASIC_AUTH_PASSWORD must be set together.',
    );
  }
  return { user, pass };
}

function createBasicAuthMiddleware(credentials: {
  readonly user: string;
  readonly pass: string;
}): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const header = req.headers.authorization;
    const decoded = header?.startsWith('Basic ')
      ? Buffer.from(header.slice(6), 'base64').toString('utf8')
      : '';
    const separator = decoded.indexOf(':');
    const user = separator >= 0 ? decoded.slice(0, separator) : '';
    const pass = separator >= 0 ? decoded.slice(separator + 1) : '';
    if (isEqual(user, credentials.user) && isEqual(pass, credentials.pass)) {
      next();
      return;
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
    res.status(401).send('Authentication required');
  };
}

function isEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
