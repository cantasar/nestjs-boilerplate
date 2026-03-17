import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    process.env.ZEPTOMAIL_URL = process.env.ZEPTOMAIL_URL ?? 'https://api.zeptomail.com/';
    process.env.ZEPTOMAIL_TOKEN = process.env.ZEPTOMAIL_TOKEN ?? 'test-token';
    process.env.MAIL_FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS ?? 'test@example.com';
    process.env.MAIL_FROM_NAME = process.env.MAIL_FROM_NAME ?? 'Test';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('/api (GET) returns 404', () => {
    return request(app.getHttpServer()).get('/api').expect(404);
  });
});
