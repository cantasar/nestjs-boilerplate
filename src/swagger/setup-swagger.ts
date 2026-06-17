import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { UserRole } from '../modules/shared/common/enums/user-role.enum';
import { AuthProvider } from '../modules/shared/database/schema/enums/auth-provider.enum';
import { ALL_ERROR_CODES } from '../modules/shared/common/errors/error-registry';

const DOCS_PATH = 'docs' as const;

// Tags exposed in the mobile/client team's scoped docs (user-facing surfaces
// only). Default-deny: an operation is kept only if its tags intersect this set,
// so admin / management routes never leak into the mobile doc.
const MOBILE_TAGS: ReadonlySet<string> = new Set([
  'Auth',
  'Profile',
  'Health',
  'Legal Documents',
  'Notifications',
]);

const HTTP_METHODS: readonly string[] = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
];

// Placeholder generic enums surfaced in components.schemas. Add your domain
// enums here so client tooling can codegen against them.
const ENUMS_TO_REGISTER: Record<string, Record<string, string>> = {
  UserRole,
  AuthProvider,
};

const BRAND_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .swagger-ui .topbar .download-url-wrapper { display: none; }
`;

const ENDPOINT_FILTER_JS = `
(function () {
  var STYLE_ID = 'api-filter-style';
  var INPUT_ID = 'api-filter-input';
  var WRAPPER_ID = 'api-filter-wrapper';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + WRAPPER_ID + ' { max-width: 1460px; margin: 20px auto 0; padding: 0 20px; }',
      '#' + INPUT_ID + ' { width: 100%; padding: 10px 14px; font-size: 14px;',
      '  border: 1px solid #d3d3d3; border-radius: 4px; box-sizing: border-box;',
      '  font-family: inherit; }',
      '#' + INPUT_ID + ':focus { outline: none; border-color: #89bf04; }',
      '.api-hidden { display: none !important; }'
    ].join('\\n');
    document.head.appendChild(s);
  }

  function textOf(el) { return (el && el.textContent ? el.textContent : '').toLowerCase(); }

  function applyFilter(query) {
    var q = query.trim().toLowerCase();
    var sections = document.querySelectorAll('.swagger-ui .opblock-tag-section');
    sections.forEach(function (section) {
      var tagName = textOf(section.querySelector('.opblock-tag'));
      var tagMatches = q === '' || tagName.indexOf(q) !== -1;
      var blocks = section.querySelectorAll('.opblock');
      var anyBlockMatches = false;
      blocks.forEach(function (block) {
        var path = textOf(block.querySelector('.opblock-summary-path')) +
                   ' ' + textOf(block.querySelector('.opblock-summary-path__deprecated'));
        var summary = textOf(block.querySelector('.opblock-summary-description'));
        var method = textOf(block.querySelector('.opblock-summary-method'));
        var matches = q === '' || tagMatches ||
                      path.indexOf(q) !== -1 ||
                      summary.indexOf(q) !== -1 ||
                      method.indexOf(q) !== -1;
        if (matches) {
          block.classList.remove('api-hidden');
          anyBlockMatches = true;
        } else {
          block.classList.add('api-hidden');
        }
      });
      if (q === '' || tagMatches || anyBlockMatches) section.classList.remove('api-hidden');
      else section.classList.add('api-hidden');
    });
  }

  function mountInput() {
    var container = document.querySelector('.swagger-ui .wrapper, .swagger-ui .information-container') ||
                    document.querySelector('.swagger-ui');
    if (!container) return false;
    if (document.getElementById(INPUT_ID)) return true;
    var wrapper = document.createElement('div');
    wrapper.id = WRAPPER_ID;
    var input = document.createElement('input');
    input.type = 'search';
    input.id = INPUT_ID;
    input.placeholder = 'Filter by tag, path, method or summary';
    input.addEventListener('input', function () { applyFilter(input.value); });
    wrapper.appendChild(input);
    var firstTag = document.querySelector('.swagger-ui .opblock-tag-section');
    if (firstTag && firstTag.parentElement) {
      firstTag.parentElement.insertBefore(wrapper, firstTag);
    } else {
      container.appendChild(wrapper);
    }
    var observer = new MutationObserver(function () {
      if (input.value) applyFilter(input.value);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return true;
  }

  injectStyle();
  var interval = setInterval(function () {
    if (mountInput()) clearInterval(interval);
  }, 300);
  setTimeout(function () { clearInterval(interval); }, 20000);
})();
`;

// Top-of-page banner linking each doc to its sibling (full <-> mobile).
function crossLinkBannerJs(href: string, label: string): string {
  return `
(function () {
  var ID = 'api-crosslink';
  function mount() {
    if (document.getElementById(ID)) return true;
    if (!document.body) return false;
    var bar = document.createElement('div');
    bar.id = ID;
    bar.style.cssText = 'padding:8px 20px;background:#1b1b1b;text-align:right;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    var a = document.createElement('a');
    a.href = ${JSON.stringify(href)};
    a.textContent = ${JSON.stringify(label)};
    a.style.cssText = 'color:#89bf04;font-size:14px;font-weight:600;text-decoration:none;';
    bar.appendChild(a);
    document.body.insertBefore(bar, document.body.firstChild);
    return true;
  }
  var t = setInterval(function () { if (mount()) clearInterval(t); }, 300);
  setTimeout(function () { clearInterval(t); }, 20000);
})();
`;
}

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
  options: { readonly apiPrefix: string; readonly docsPrefix?: string },
): boolean {
  if (config.get<string>('SWAGGER_ENABLED') === 'false') return false;
  const docsMount = (options.docsPrefix ?? options.apiPrefix).replace(
    /^\/+|\/+$/g,
    '',
  );
  const docsRoute = `${docsMount}/${DOCS_PATH}`;
  const mobileRoute = `${docsMount}/mobile/${DOCS_PATH}`;
  const basicAuth = getBasicAuth(config);
  if (basicAuth) {
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    for (const route of [docsRoute, mobileRoute]) {
      const basePath = `/${route}`;
      expressApp.use(basePath, createBasicAuthMiddleware(basicAuth));
      expressApp.use(`${basePath}/`, createBasicAuthMiddleware(basicAuth));
    }
  }
  const builder = new DocumentBuilder()
    .setTitle('NestJS Boilerplate API')
    .setDescription('Production-ready API with JWT auth.')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key');
  for (const server of resolveServers(config)) {
    builder.addServer(server.url, server.description);
  }
  const baseConfig = builder.build();

  // Build the full document once; the mobile doc is a tag-filtered view of it.
  const fullDocument = SwaggerModule.createDocument(app, baseConfig, {
    deepScanRoutes: true,
  });
  registerEnumSchemas(fullDocument);
  const mobileDocument = filterDocumentByTags(fullDocument, MOBILE_TAGS);

  const mountDoc = (
    route: string,
    siteTitle: string,
    document: OpenAPIObject,
    crossLink: { readonly href: string; readonly label: string },
  ): void => {
    SwaggerModule.setup(route, app, document, {
      useGlobalPrefix: false,
      customSiteTitle: siteTitle,
      customCss: BRAND_CSS,
      customJsStr:
        ENDPOINT_FILTER_JS + crossLinkBannerJs(crossLink.href, crossLink.label),
      jsonDocumentUrl: `${route}/openapi.json`,
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 10,
        displayRequestDuration: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        filter: false,
      },
    });
  };

  mountDoc(docsRoute, 'NestJS Boilerplate | API Docs', fullDocument, {
    href: `/${mobileRoute}`,
    label: 'Mobile API Docs →',
  });
  mountDoc(
    mobileRoute,
    'NestJS Boilerplate | Mobile API Docs',
    mobileDocument,
    {
      href: `/${docsRoute}`,
      label: '← Full API Docs',
    },
  );
  return true;
}

// Shallow-clone the OpenAPI document keeping only operations whose tags
// intersect `allowed`. Components are shared by reference (unused schemas are
// harmless), so enum registration on the source doc carries over.
function filterDocumentByTags(
  document: OpenAPIObject,
  allowed: ReadonlySet<string>,
): OpenAPIObject {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [route, item] of Object.entries(document.paths)) {
    if (!item || typeof item !== 'object') continue;
    const kept: Record<string, unknown> = {};
    let hasOperation = false;
    for (const [key, value] of Object.entries(
      item as Record<string, unknown>,
    )) {
      if (!HTTP_METHODS.includes(key)) {
        kept[key] = value; // path-level parameters / servers / $ref
        continue;
      }
      if (operationHasAllowedTag(value, allowed)) {
        kept[key] = value;
        hasOperation = true;
      }
    }
    if (hasOperation) paths[route] = kept;
  }
  return {
    ...document,
    paths,
    tags: document.tags?.filter((tag) => allowed.has(tag.name)),
  } as OpenAPIObject;
}

function operationHasAllowedTag(
  operation: unknown,
  allowed: ReadonlySet<string>,
): boolean {
  if (!operation || typeof operation !== 'object') return false;
  const tags = (operation as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => typeof tag === 'string' && allowed.has(tag));
}

function resolveServers(
  config: ConfigService,
): readonly { readonly url: string; readonly description: string }[] {
  const raw = config.get<string>('SWAGGER_SERVERS')?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [url, ...descParts] = entry.split('|');
        return {
          url: (url ?? '').trim(),
          description: descParts.join('|').trim() || (url ?? '').trim(),
        };
      })
      .filter((s) => s.url.length > 0);
  }
  // Relative `/` resolves to the current request origin — works on any host
  // without configuration. Override with SWAGGER_SERVERS when an explicit list
  // is needed.
  const port = config.get<string>('PORT') ?? '3000';
  return [
    { url: '/', description: 'Current host' },
    { url: `http://localhost:${port}`, description: 'Local' },
  ];
}

function registerEnumSchemas(document: {
  components?: { schemas?: Record<string, unknown> };
}): void {
  document.components = document.components ?? {};
  document.components.schemas = document.components.schemas ?? {};
  for (const [name, enumObj] of Object.entries(ENUMS_TO_REGISTER)) {
    if (document.components.schemas[name]) continue;
    document.components.schemas[name] = {
      type: 'string',
      enum: Object.values(enumObj),
      description: `${name} enum values`,
    };
  }
  // Surface every stable error code from the registry as a single enum schema so
  // clients can codegen an exhaustive `ErrorCode` union for `error.code`.
  if (!document.components.schemas.ErrorCode) {
    document.components.schemas.ErrorCode = {
      type: 'string',
      enum: [...ALL_ERROR_CODES],
      description: 'Every stable machine-readable error code (error.code).',
    };
  }
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
