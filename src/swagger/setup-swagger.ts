import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { UserRole } from '../modules/shared/common/enums/user-role.enum';
import { AuthProvider } from '../modules/shared/database/schema/enums/auth-provider.enum';
import { ALL_ERROR_CODES } from '../modules/shared/common/errors/error-registry';
import { convert as convertOpenApiToPostman } from 'openapi-to-postmanv2';

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
  /* Per-operation "Copy MD" button */
  .swagger-ui .opblock-summary .api-copy-md { margin-left: 8px; padding: 2px 8px;
    font-size: 11px; cursor: pointer; border: 1px solid #89bf04; background: #fff;
    color: #3b4151; border-radius: 4px; font-family: inherit; }
  /* Top-bar actions (Export Postman + Copy Enums) — right-aligned */
  .swagger-ui .topbar #api-topbar-actions { margin-left: auto; display: flex;
    align-items: center; gap: 8px; flex: 0 0 auto; }
  .api-postman, .api-enums { font-size: 13px; font-weight: 600; cursor: pointer;
    border: 1px solid #89bf04; border-radius: 4px; padding: 6px 12px; line-height: 1.2;
    text-decoration: none; display: inline-block; font-family: inherit; white-space: nowrap; }
  .api-postman { background: #89bf04; color: #1b1b1b; }
  .api-enums { background: #fff; color: #3b4151; }
  /* High specificity — swagger-ui's .topbar link/button styles otherwise inflate the font. */
  .swagger-ui .topbar #api-topbar-actions .api-postman,
  .swagger-ui .topbar #api-topbar-actions .api-enums { font-size: 13px; line-height: 1.2;
    padding: 6px 12px; height: auto; }
  /* Global expand/collapse-all controls — left of the Authorize button */
  #api-collapse-controls { display: inline-flex; gap: 8px; margin-right: 12px;
    align-items: center; }
  .api-collapse-btn { padding: 6px 12px; font-size: 13px; cursor: pointer;
    border: 1px solid #89bf04; background: #fff; color: #3b4151; border-radius: 4px;
    font-family: inherit; white-space: nowrap; }
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

// Global Expand all / Collapse all for the tag groups (per-tag toggle already
// exists in swagger-ui). A tag section is "open" when its operations are mounted
// in the DOM; clicking the tag header toggles it. Mounts left of Authorize.
const COLLAPSE_CONTROLS_JS = `
(function () {
  function isOpen(sec) { return !!sec.querySelector('.opblock'); }
  function setAll(open) {
    document.querySelectorAll('.swagger-ui .opblock-tag-section').forEach(function (sec) {
      if (isOpen(sec) !== open) {
        var tag = sec.querySelector('.opblock-tag');
        if (tag) tag.click();
      }
    });
  }
  function mount() {
    if (document.getElementById('api-collapse-controls')) return true;
    var authWrap = document.querySelector('.swagger-ui .scheme-container .auth-wrapper');
    if (!authWrap) return false;
    var bar = document.createElement('div'); bar.id = 'api-collapse-controls';
    var ex = document.createElement('button');
    ex.type = 'button'; ex.className = 'api-collapse-btn'; ex.textContent = 'Expand all';
    var co = document.createElement('button');
    co.type = 'button'; co.className = 'api-collapse-btn'; co.textContent = 'Collapse all';
    ex.addEventListener('click', function () { setAll(true); });
    co.addEventListener('click', function () { setAll(false); });
    bar.appendChild(ex); bar.appendChild(co);
    authWrap.insertBefore(bar, authWrap.firstChild);
    return true;
  }
  var t = setInterval(function () { if (mount()) clearInterval(t); }, 400);
  setTimeout(function () { clearInterval(t); }, 20000);
})();
`;

// Per-operation "Copy MD" button + a top-bar "Copy Enums" button. Reads the live
// spec from swagger-ui (window.ui), so no extra fetch is needed.
const COPY_MARKDOWN_JS = `
(function () {
  function getSpec() {
    try { return window.ui.specSelectors.specJson().toJS(); } catch (e) { return null; }
  }
  function refName(ref) { return typeof ref === 'string' ? ref.split('/').pop() : ''; }
  function schemaName(s) {
    if (!s) return '';
    if (s.$ref) return refName(s.$ref);
    if (s.type === 'array' && s.items) return schemaName(s.items) + '[]';
    return s.type || 'object';
  }
  function clean(v) { return String(v == null ? '' : v).replace(/\\r?\\n/g, ' ').replace(/\\|/g, '\\\\|'); }
  function deref(spec, schema) {
    var guard = 0;
    while (schema && schema.$ref && guard < 20) {
      schema = (spec.components && spec.components.schemas && spec.components.schemas[refName(schema.$ref)]) || null;
      guard++;
    }
    return schema;
  }
  function collectProps(spec, schema) {
    schema = deref(spec, schema);
    if (!schema || typeof schema !== 'object') return { order: [], props: {}, required: {} };
    var props = {}; var required = {}; var order = [];
    function add(s) {
      s = deref(spec, s);
      if (!s) return;
      if (Array.isArray(s.allOf)) s.allOf.forEach(add);
      (s.required || []).forEach(function (k) { required[k] = true; });
      if (s.properties) {
        Object.keys(s.properties).forEach(function (k) {
          if (!(k in props)) order.push(k);
          props[k] = s.properties[k];
        });
      }
    }
    add(schema);
    return { order: order, props: props, required: required };
  }
  function enumValues(spec, s) {
    var d = deref(spec, s);
    if (!d) return null;
    if (Array.isArray(d.enum)) return d.enum;
    if (d.type === 'array' && d.items) {
      var di = deref(spec, d.items);
      if (di && Array.isArray(di.enum)) return di.enum;
    }
    return null;
  }
  function typeLabel(spec, s) {
    if (!s) return '';
    var base = schemaName(s);
    var ev = enumValues(spec, s);
    if (ev && ev.length) {
      var shown = ev.slice(0, 12).map(String).join(' | ');
      return base + ' (' + (ev.length > 12 ? shown + ' | …' : shown) + ')';
    }
    return base;
  }
  function opToMarkdown(spec, path, method) {
    var op = spec && spec.paths && spec.paths[path] && spec.paths[path][method];
    if (!op) return '';
    var L = ['### \\\`' + method.toUpperCase() + '\\\` ' + path];
    if (op.summary) L.push('', op.summary);
    if (op.description) L.push('', op.description);
    var sec = op.security || spec.security;
    if (sec && sec.length) {
      L.push('', '**Auth:** ' + sec.map(function (s) { return Object.keys(s).join(' + '); }).join(', '));
    }
    var params = op.parameters || [];
    if (params.length) {
      L.push('', '**Parameters**', '', '| Name | In | Type | Required | Description |', '| --- | --- | --- | --- | --- |');
      params.forEach(function (p) {
        L.push('| ' + clean(p.name) + ' | ' + clean(p.in) + ' | ' + clean(typeLabel(spec, p.schema)) + ' | ' + (p.required ? 'yes' : 'no') + ' | ' + clean(p.description) + ' |');
      });
    }
    var rb = op.requestBody;
    if (rb && rb.content) {
      var ct = Object.keys(rb.content)[0];
      var rbSchema = rb.content[ct] && rb.content[ct].schema;
      L.push('', '**Request body** (' + ct + '): \\\`' + schemaName(rbSchema) + '\\\`');
      var fields = collectProps(spec, rbSchema);
      if (fields.order.length) {
        L.push('', '| Field | Type | Required | Description |', '| --- | --- | --- | --- |');
        fields.order.forEach(function (k) {
          var p = fields.props[k] || {};
          L.push('| ' + clean(k) + ' | ' + clean(typeLabel(spec, p)) + ' | ' + (fields.required[k] ? 'yes' : 'no') + ' | ' + clean(p.description) + ' |');
        });
      }
    }
    if (op.responses) {
      L.push('', '**Responses**', '', '| Status | Body | Description |', '| --- | --- | --- |');
      var successSchema = null;
      Object.keys(op.responses).forEach(function (code) {
        var r = op.responses[code] || {};
        var body = '';
        if (r.content) {
          var rct = Object.keys(r.content)[0];
          var rs = r.content[rct] && r.content[rct].schema;
          if (rs) {
            body = '\\\`' + clean(schemaName(rs)) + '\\\`';
            if (!successSchema && code.charAt(0) === '2') successSchema = rs;
          }
        }
        L.push('| ' + clean(code) + ' | ' + body + ' | ' + clean(r.description) + ' |');
      });
      var rf = collectProps(spec, successSchema);
      if (rf.order.length) {
        L.push('', '**Response body** \\\`' + schemaName(successSchema) + '\\\`', '', '| Field | Type | Required | Description |', '| --- | --- | --- | --- |');
        rf.order.forEach(function (k) {
          var p = rf.props[k] || {};
          L.push('| ' + clean(k) + ' | ' + clean(typeLabel(spec, p)) + ' | ' + (rf.required[k] ? 'yes' : 'no') + ' | ' + clean(p.description) + ' |');
        });
      }
    }
    return L.join('\\n');
  }
  function enumsMarkdown(spec) {
    var schemas = (spec && spec.components && spec.components.schemas) || {};
    var L = ['## Enums'];
    Object.keys(schemas).sort().forEach(function (name) {
      var s = schemas[name];
      var vals = s && Array.isArray(s.enum) ? s.enum : null;
      if (!vals || !vals.length) return;
      L.push('', '### ' + name, '', vals.map(function (v) { return '\\\`' + String(v) + '\\\`'; }).join(' | '));
    });
    return L.length > 1 ? L.join('\\n') : '';
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }
  function copy(text, btn) {
    var orig = btn.textContent;
    function done() { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = orig; }, 1200); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function opInfo(block) {
    var pathEl = block.querySelector('.opblock-summary-path, .opblock-summary-path__deprecated');
    var methodEl = block.querySelector('.opblock-summary-method');
    if (!pathEl || !methodEl) return null;
    var path = (pathEl.getAttribute('data-path') || pathEl.textContent || '').trim();
    return { path: path, method: (methodEl.textContent || '').trim().toLowerCase() };
  }
  function topbarActions() {
    var box = document.getElementById('api-topbar-actions');
    if (box) return box;
    var bar = document.querySelector('.swagger-ui .topbar .topbar-wrapper') ||
              document.querySelector('.swagger-ui .topbar');
    if (!bar) return null;
    box = document.createElement('div'); box.id = 'api-topbar-actions';
    bar.appendChild(box);
    return box;
  }
  function attach() {
    document.querySelectorAll('.swagger-ui .opblock').forEach(function (block) {
      var summary = block.querySelector('.opblock-summary');
      if (!summary || summary.querySelector('.api-copy-md')) return;
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'api-copy-md'; btn.textContent = 'Copy MD';
      btn.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        var info = opInfo(block); var spec = getSpec();
        if (!info || !spec) return;
        var md = opToMarkdown(spec, info.path, info.method);
        if (md) copy(md, btn);
      });
      summary.appendChild(btn);
    });
  }
  function mountEnumsButton() {
    var box = topbarActions();
    if (!box || box.querySelector('.api-enums')) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'api-enums'; btn.textContent = 'Copy Enums';
    btn.addEventListener('click', function () {
      var spec = getSpec(); if (!spec) return;
      var md = enumsMarkdown(spec);
      if (md) copy(md, btn);
    });
    box.appendChild(btn);
  }
  function tick() { attach(); mountEnumsButton(); }
  try {
    var iv = setInterval(tick, 600);
    setTimeout(function () { clearInterval(iv); }, 20000);
    new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
})();
`;

// Top-bar button (separated from content) that downloads the converted Postman
// collection for this doc.
function postmanButtonJs(href: string): string {
  return `
(function () {
  var HREF = ${JSON.stringify(href)};
  function topbarActions() {
    var box = document.getElementById('api-topbar-actions');
    if (box) return box;
    var bar = document.querySelector('.swagger-ui .topbar .topbar-wrapper') ||
              document.querySelector('.swagger-ui .topbar');
    if (!bar) return null;
    box = document.createElement('div'); box.id = 'api-topbar-actions';
    bar.appendChild(box);
    return box;
  }
  function mount() {
    var box = topbarActions(); if (!box) return false;
    if (box.querySelector('.api-postman')) return true;
    var a = document.createElement('a');
    a.className = 'api-postman'; a.href = HREF; a.setAttribute('download', '');
    a.textContent = 'Export Postman Collection';
    box.appendChild(a);
    return true;
  }
  var t = setInterval(function () { if (mount()) clearInterval(t); }, 400);
  setTimeout(function () { clearInterval(t); }, 20000);
})();
`;
}

// Convert the in-memory OpenAPI document to a Postman Collection v2.1.
function buildPostmanCollection(document: OpenAPIObject): Promise<object> {
  return new Promise((resolve, reject) => {
    convertOpenApiToPostman(
      { type: 'json', data: document as object },
      { folderStrategy: 'Tags', requestParametersResolution: 'Example' },
      (err, result) => {
        if (err) {
          reject(new Error(err.message));
          return;
        }
        const data = result?.output?.[0]?.data;
        if (!result?.result || !data) {
          reject(
            new Error(
              result?.reason ?? 'Postman conversion produced no output',
            ),
          );
          return;
        }
        resolve(data);
      },
    );
  });
}

// GET /<route>/postman.json — converts once on first request, caches the JSON.
function registerPostmanRoute(
  expressApp: Express,
  route: string,
  document: OpenAPIObject,
): void {
  let cached: string | null = null;
  let pending: Promise<string> | null = null;
  expressApp.get(`/${route}/postman.json`, (_req: Request, res: Response) => {
    const send = (json: string): void => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="openapi.postman_collection.json"',
      );
      res.send(json);
    };
    if (cached) {
      send(cached);
      return;
    }
    pending ??= buildPostmanCollection(document).then((collection) => {
      cached = JSON.stringify(collection);
      return cached;
    });
    pending.then(send).catch((e: unknown) => {
      pending = null;
      res.status(500).json({
        message: 'Postman conversion failed',
        error: e instanceof Error ? e.message : String(e),
      });
    });
  });
}

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
  options: { readonly apiPrefix: string; readonly docsPrefix?: string },
): boolean {
  // Default-deny in production: docs are served only when SWAGGER_ENABLED is
  // explicitly 'true'. Outside production they default on (disable with 'false').
  const swaggerEnabled = config.get<string>('SWAGGER_ENABLED');
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  if (isProduction ? swaggerEnabled !== 'true' : swaggerEnabled === 'false') {
    return false;
  }
  const docsMount = (options.docsPrefix ?? options.apiPrefix).replace(
    /^\/+|\/+$/g,
    '',
  );
  const docsRoute = `${docsMount}/${DOCS_PATH}`;
  const mobileRoute = `${docsMount}/mobile/${DOCS_PATH}`;
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  const basicAuth = getBasicAuth(config);
  if (basicAuth) {
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
  registerErrorCodeSchema(fullDocument);
  const mobileDocument = filterDocumentByTags(fullDocument, MOBILE_TAGS);

  // Postman collection downloads (converted lazily + cached). Registered under
  // the docs route so any configured basic-auth middleware already covers them.
  registerPostmanRoute(expressApp, docsRoute, fullDocument);
  registerPostmanRoute(expressApp, mobileRoute, mobileDocument);

  const mountDoc = (
    route: string,
    siteTitle: string,
    document: OpenAPIObject,
    crossLink: { readonly href: string; readonly label: string },
    postmanHref: string,
  ): void => {
    SwaggerModule.setup(route, app, document, {
      useGlobalPrefix: false,
      customSiteTitle: siteTitle,
      customCss: BRAND_CSS,
      customJsStr:
        ENDPOINT_FILTER_JS +
        COLLAPSE_CONTROLS_JS +
        COPY_MARKDOWN_JS +
        postmanButtonJs(postmanHref) +
        crossLinkBannerJs(crossLink.href, crossLink.label),
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

  mountDoc(
    docsRoute,
    'NestJS Boilerplate | API Docs',
    fullDocument,
    { href: `/${mobileRoute}`, label: 'Mobile API Docs →' },
    `/${docsRoute}/postman.json`,
  );
  mountDoc(
    mobileRoute,
    'NestJS Boilerplate | Mobile API Docs',
    mobileDocument,
    { href: `/${docsRoute}`, label: '← Full API Docs' },
    `/${mobileRoute}/postman.json`,
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
}

// Surface every stable error code from the registry as a single `ErrorCode`
// string enum so clients can codegen an exhaustive union for `error.code`. The
// catalog is documented once in components.schemas.
function registerErrorCodeSchema(document: {
  components?: { schemas?: Record<string, unknown> };
}): void {
  document.components = document.components ?? {};
  document.components.schemas = document.components.schemas ?? {};
  if (document.components.schemas.ErrorCode) return;
  document.components.schemas.ErrorCode = {
    type: 'string',
    enum: [...ALL_ERROR_CODES],
    description: 'Every stable machine-readable error code (error.code).',
  };
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
