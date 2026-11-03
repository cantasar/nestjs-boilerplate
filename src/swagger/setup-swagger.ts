import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ALL_ERROR_CODES } from '../modules/shared/common/errors/error-registry';
import { ErrorResponseDto } from '../modules/shared/common/errors/dto/error-response.dto';
import { AuthProvider } from '../modules/shared/database/schema/enums/auth-provider.enum';
import { UserRole } from '../modules/shared/database/schema/enums/user-role.enum';

// Tags shown in the mobile docs. Add user-facing tags here; admin and internal routes stay out.
const MOBILE_TAGS: ReadonlySet<string> = new Set(['Auth']);

// Enums added to the schema list, so clients can generate types from them.
const ENUM_SCHEMAS: Record<string, Record<string, string>> = {
  UserRole,
  AuthProvider,
};

const API_DESCRIPTION = [
  'Every `/api/v1` response uses one envelope:',
  '- Success: `{ success: true, data, meta? }`',
  '- Error: `{ success: false, error: { code, message, details? } }` (`ErrorResponseDto` schema)',
  '',
  'Branch on `error.code` (see the `ErrorCode` schema), not on `message`.',
].join('\n');

/** Mounts Swagger UI at `/{prefix}/docs` and a mobile-only view at `/{prefix}/mobile/docs`. Returns false when off. */
export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
  prefix: string,
): boolean {
  // Off in production unless SWAGGER_ENABLED=true. On elsewhere unless it is 'false'.
  const enabled = config.get<string>('SWAGGER_ENABLED');
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  if (isProduction ? enabled !== 'true' : enabled === 'false') return false;

  const builder = new DocumentBuilder()
    .setTitle('API')
    .setDescription(API_DESCRIPTION)
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key');
  for (const server of parseServers(config.get<string>('SWAGGER_SERVERS'))) {
    builder.addServer(server.url, server.description);
  }

  const document = SwaggerModule.createDocument(app, builder.build(), {
    extraModels: [ErrorResponseDto],
  });
  addSharedSchemas(document);

  const views = [
    { path: `${prefix}/docs`, title: 'API Docs', document },
    {
      path: `${prefix}/mobile/docs`,
      title: 'Mobile API Docs',
      document: filterByTags(document, MOBILE_TAGS),
    },
  ];
  const basicAuth = createBasicAuth(config);
  if (basicAuth) {
    // Express matches mount paths like routes (any letter case). The -json/-yaml paths are SwaggerModule's defaults.
    app.use(
      views.flatMap((view) => [
        `/${view.path}`,
        `/${view.path}-json`,
        `/${view.path}-yaml`,
      ]),
      basicAuth,
    );
  }
  for (const view of views) {
    SwaggerModule.setup(view.path, app, view.document, {
      customSiteTitle: view.title,
      jsonDocumentUrl: `${view.path}/openapi.json`,
      yamlDocumentUrl: `${view.path}/openapi.yaml`,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tagsSorter: 'alpha',
      },
    });
  }
  return true;
}

/** Reads SWAGGER_SERVERS as `url|description,url|description`. Defaults to the current host. */
function parseServers(
  raw: string | undefined,
): { url: string; description: string }[] {
  const servers = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url = '', ...rest] = entry.split('|');
      return { url: url.trim(), description: rest.join('|').trim() || url };
    })
    .filter((server) => server.url.length > 0);
  return servers.length > 0
    ? servers
    : [{ url: '/', description: 'Current host' }];
}

function addSharedSchemas(document: OpenAPIObject): void {
  document.components ??= {};
  const schemas = (document.components.schemas ??= {});
  for (const [name, values] of Object.entries(ENUM_SCHEMAS)) {
    schemas[name] ??= { type: 'string', enum: Object.values(values) };
  }
  schemas.ErrorCode = {
    type: 'string',
    enum: [...ALL_ERROR_CODES],
    description: 'Every stable `error.code` value.',
  };
}

/** Keeps only the operations that have at least one allowed tag. */
function filterByTags(
  document: OpenAPIObject,
  allowed: ReadonlySet<string>,
): OpenAPIObject {
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
  const paths: OpenAPIObject['paths'] = {};
  for (const [route, item] of Object.entries(document.paths)) {
    const kept = { ...item };
    let hasOperation = false;
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      if (operation.tags?.some((tag) => allowed.has(tag))) hasOperation = true;
      else delete kept[method];
    }
    if (hasOperation) paths[route] = kept;
  }
  return {
    ...document,
    paths,
    tags: document.tags?.filter((tag) => allowed.has(tag.name)),
  };
}

/** Basic auth for the docs when SWAGGER_BASIC_AUTH_USER and _PASSWORD are set. */
function createBasicAuth(
  config: ConfigService,
): ((req: Request, res: Response, next: NextFunction) => void) | null {
  const user = config.get<string>('SWAGGER_BASIC_AUTH_USER')?.trim() ?? '';
  const pass = config.get<string>('SWAGGER_BASIC_AUTH_PASSWORD')?.trim() ?? '';
  if (!user && !pass) return null;
  if (!user || !pass) {
    throw new Error(
      'Both SWAGGER_BASIC_AUTH_USER and SWAGGER_BASIC_AUTH_PASSWORD must be set together.',
    );
  }
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const decoded = header.startsWith('Basic ')
      ? Buffer.from(header.slice(6), 'base64').toString('utf8')
      : '';
    const separator = decoded.indexOf(':');
    const givenUser = separator >= 0 ? decoded.slice(0, separator) : '';
    const givenPass = separator >= 0 ? decoded.slice(separator + 1) : '';
    if (safeEqual(givenUser, user) && safeEqual(givenPass, pass)) {
      next();
      return;
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
    res.status(401).send('Authentication required');
  };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
