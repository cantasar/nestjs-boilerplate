import { Controller, Get, Post, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ApiTags } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { setupSwagger } from './setup-swagger';
import {
  DOCS_PREFIX,
  configureVersioning,
} from '../modules/shared/common/config/app-versioning';
import { ALL_ERROR_CODES } from '../modules/shared/common/errors/error-registry';
import { UserRole } from '../modules/shared/database/schema/enums/user-role.enum';
import { AuthProvider } from '../modules/shared/database/schema/enums/auth-provider.enum';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
class AuthProbeController {
  @Get('ping')
  ping(): string {
    return 'ok';
  }

  @Get('shared')
  sharedRead(): string {
    return 'ok';
  }
}

@ApiTags('Internal')
@Controller({ path: 'auth', version: '1' })
class InternalProbeController {
  @Post('shared')
  sharedWrite(): string {
    return 'ok';
  }

  @Get('internal-only')
  internalOnly(): string {
    return 'ok';
  }
}

@Controller({ path: 'untagged', version: '1' })
class UntaggedController {
  @Get()
  list(): string {
    return 'ok';
  }
}

const USER = 'docs-user';
const PASSWORD = 'docs-password-123';

/** True when a response body carries the API document (JSON, YAML or the UI init script). */
const leaks = (text: string | undefined) =>
  (text ?? '').includes('/api/v1/auth/internal-only');

function stubConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

async function createApp(
  values: Record<string, string | undefined>,
): Promise<{ app: INestApplication; enabled: boolean }> {
  const moduleRef = await Test.createTestingModule({
    controllers: [
      AuthProbeController,
      InternalProbeController,
      UntaggedController,
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureVersioning(app);
  const enabled = setupSwagger(app, stubConfig(values), DOCS_PREFIX);
  await app.init();
  return { app, enabled };
}

describe('setupSwagger', () => {
  describe('on/off switch', () => {
    it.each([
      [{ NODE_ENV: 'production' }, false],
      [{ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }, true],
      [{ NODE_ENV: 'development' }, true],
      [{ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }, false],
    ])('%j -> enabled=%s', async (values, expected) => {
      const { app, enabled } = await createApp(values);
      try {
        expect(enabled).toBe(expected);
        const res = await request(app.getHttpServer()).get(
          `/${DOCS_PREFIX}/docs/openapi.json`,
        );
        expect(res.status).toBe(expected ? 200 : 404);
      } finally {
        await app.close();
      }
    });

    it('refuses to start with only half of the basic auth pair', async () => {
      await expect(
        createApp({ NODE_ENV: 'development', SWAGGER_BASIC_AUTH_USER: USER }),
      ).rejects.toThrow(/must be set together/);
      await expect(
        createApp({
          NODE_ENV: 'development',
          SWAGGER_BASIC_AUTH_PASSWORD: PASSWORD,
        }),
      ).rejects.toThrow(/must be set together/);
    });
  });

  describe('documents', () => {
    let app: INestApplication;
    let full: OpenAPIObject;
    let mobile: OpenAPIObject;

    beforeAll(async () => {
      ({ app } = await createApp({ NODE_ENV: 'development' }));
      const server = app.getHttpServer();
      full = (await request(server).get(`/${DOCS_PREFIX}/docs/openapi.json`))
        .body as OpenAPIObject;
      mobile = (
        await request(server).get(`/${DOCS_PREFIX}/mobile/docs/openapi.json`)
      ).body as OpenAPIObject;
    });

    afterAll(async () => {
      await app.close();
    });

    it('lists every route in the full document', () => {
      expect(Object.keys(full.paths).sort()).toEqual(
        [
          '/api/v1/auth/internal-only',
          '/api/v1/auth/ping',
          '/api/v1/auth/shared',
          '/api/v1/untagged',
        ].sort(),
      );
    });

    it('keeps only Auth operations in the mobile document', () => {
      expect(Object.keys(mobile.paths).sort()).toEqual(
        ['/api/v1/auth/ping', '/api/v1/auth/shared'].sort(),
      );
      // Same path, two tags: the Auth GET stays, the Internal POST goes.
      expect(mobile.paths['/api/v1/auth/shared']?.get).toBeDefined();
      expect(mobile.paths['/api/v1/auth/shared']?.post).toBeUndefined();
      expect(full.paths['/api/v1/auth/shared']?.post).toBeDefined();
    });

    it('keeps only allowed tags in the mobile tag list', () => {
      for (const tag of mobile.tags ?? []) {
        expect(tag.name).toBe('Auth');
      }
    });

    it('adds the ErrorCode and enum schemas', () => {
      const schemas = full.components?.schemas ?? {};
      expect(schemas.ErrorCode).toEqual(
        expect.objectContaining({ enum: [...ALL_ERROR_CODES] }),
      );
      expect(schemas.UserRole).toEqual(
        expect.objectContaining({ enum: Object.values(UserRole) }),
      );
      expect(schemas.AuthProvider).toEqual(
        expect.objectContaining({ enum: Object.values(AuthProvider) }),
      );
    });

    it('declares the bearer and api-key security schemes', () => {
      const schemes = full.components?.securitySchemes ?? {};
      expect(schemes).toHaveProperty('bearer');
      expect(schemes).toHaveProperty('api-key');
    });

    it('lists the ErrorResponseDto schema (the error envelope)', () => {
      const schemas = full.components?.schemas ?? {};
      expect(schemas).toHaveProperty('ErrorResponseDto');
      expect(schemas).toHaveProperty('ErrorDetailDto');
      expect(full.info.description).toContain('ErrorResponseDto');
    });

    it('serves YAML under the docs path, and no longer at <path>-yaml', async () => {
      const server = app.getHttpServer();
      for (const base of [
        `/${DOCS_PREFIX}/docs`,
        `/${DOCS_PREFIX}/mobile/docs`,
      ]) {
        const yaml = await request(server).get(`${base}/openapi.yaml`);
        expect({ base, status: yaml.status }).toEqual({ base, status: 200 });
        expect(yaml.text).toContain('openapi:');

        const old = await request(server).get(`${base}-yaml`);
        expect({ base, status: old.status }).toEqual({ base, status: 404 });
      }
    });
  });

  describe('basic auth', () => {
    let app: INestApplication;

    beforeAll(async () => {
      ({ app } = await createApp({
        NODE_ENV: 'development',
        SWAGGER_BASIC_AUTH_USER: USER,
        SWAGGER_BASIC_AUTH_PASSWORD: PASSWORD,
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it.each([
      `/${DOCS_PREFIX}/docs`,
      `/${DOCS_PREFIX}/docs/openapi.json`,
      `/${DOCS_PREFIX}/docs/openapi.yaml`,
      `/${DOCS_PREFIX}/docs/swagger-ui-init.js`,
      `/${DOCS_PREFIX}/mobile/docs`,
      `/${DOCS_PREFIX}/mobile/docs/openapi.json`,
      `/${DOCS_PREFIX}/mobile/docs/openapi.yaml`,
      `/${DOCS_PREFIX}/mobile/docs/swagger-ui-init.js`,
    ])('%s asks for credentials', async (path) => {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic /);
    });

    it('rejects wrong credentials', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${DOCS_PREFIX}/docs/openapi.json`)
        .auth(USER, 'wrong-password');
      expect(res.status).toBe(401);
    });

    it('serves the docs with the right credentials', async () => {
      const server = app.getHttpServer();
      const json = await request(server)
        .get(`/${DOCS_PREFIX}/docs/openapi.json`)
        .auth(USER, PASSWORD);
      expect(json.status).toBe(200);
      const ui = await request(server)
        .get(`/${DOCS_PREFIX}/mobile/docs`)
        .auth(USER, PASSWORD)
        .redirects(1);
      expect(ui.status).toBe(200);
    });

    // Run 1 item M5: the old `<path>-yaml` URL leaked the whole document without a password.
    it.each([
      `/${DOCS_PREFIX}/docs-yaml`,
      `/${DOCS_PREFIX}/docs-json`,
      `/${DOCS_PREFIX}/mobile/docs-yaml`,
      `/${DOCS_PREFIX}/mobile/docs-json`,
    ])('%s does not serve the document without credentials', async (path) => {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).not.toBe(200);
      expect(res.text).not.toContain('/api/v1/auth/internal-only');
    });

    // M5 (run 4): the basic auth is mounted like the routes, so every letter case and method needs it.
    it.each([
      ['head', `/API/v1/docs/openapi.json`],
      ['get', `/API/V1/DOCS`],
      ['get', `/api/v1/docs/INDEX.HTML`],
      ['get', `/Api/V1/Mobile/Docs/swagger-ui-init.js`],
      ['get', `/api/v1/DOCS-JSON`],
      ['get', `/api/v1/mobile/docs-YAML`],
    ] as const)('%s %s asks for credentials', async (method, path) => {
      const res = await request(app.getHttpServer())[method](path);
      expect({
        path,
        status: res.status,
        leaked: leaks(res.text ?? ''),
      }).toEqual({ path, status: 401, leaked: false });
    });

    it('serves the document in another letter case with the right credentials', async () => {
      const res = await request(app.getHttpServer())
        .get('/API/v1/DOCS/openapi.json')
        .auth(USER, PASSWORD);
      expect(res.status).toBe(200);
    });

    // Run 3 item: Express matches routes in any letter case, but the basic-auth prefix check is
    // case-sensitive, so `/API/v1/docs/...` may skip the password.
    it.each([
      `/API/v1/docs/openapi.json`,
      `/api/V1/docs/openapi.json`,
      `/api/v1/Docs/openapi.yaml`,
      `/api/v1/DOCS/swagger-ui-init.js`,
      `/api/v1/MOBILE/docs/openapi.json`,
      `/api/v1/mobile/DOCS/openapi.yaml`,
    ])('%s does not skip the password by letter case', async (path) => {
      const res = await request(app.getHttpServer()).get(path);
      expect({ path, status: res.status, leaked: leaks(res.text) }).toEqual({
        path,
        status: res.status === 404 ? 404 : 401,
        leaked: false,
      });
    });

    it.each([
      `//${DOCS_PREFIX}/docs/openapi.json`,
      `/${DOCS_PREFIX}//docs/openapi.json`,
      `/${DOCS_PREFIX}/%64ocs/openapi.json`,
      `/${DOCS_PREFIX}/docs/openapi.json/`,
      `/${DOCS_PREFIX}/docs/openapi.json?x=1`,
    ])('%s does not skip the password by path tricks', async (path) => {
      const res = await request(app.getHttpServer()).get(path);
      expect({ path, ok: res.status === 200, leaked: leaks(res.text) }).toEqual(
        { path, ok: false, leaked: false },
      );
    });
  });
});
