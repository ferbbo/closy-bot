/**
 * PR-FE-00: CORS E2E Tests
 * Tests CORS configuration for dashboard frontend access
 *
 * AC-01: OPTIONS preflight returns CORS headers
 * AC-02: GET request with allowed origin gets CORS headers
 * AC-03: Multiple origins parsed correctly (tested via env var parsing in unit)
 * AC-05: Request from disallowed origin does not get CORS headers
 * AC-06: Set-Cookie exposed in headers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

describe('CORS (e2e) - PR-FE-00', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Set test env var for CORS origins
    process.env.CORS_ORIGINS = 'http://localhost:3001,http://localhost:3002';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror production config
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Configure CORS as in main.ts
    const corsOrigins = process.env.CORS_ORIGINS || 'http://localhost:3001';
    const allowedOrigins = corsOrigins.split(',').map((o) => o.trim());

    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Cookie', 'x-api-key', 'Authorization'],
      exposedHeaders: ['Set-Cookie'],
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    // Clean up env
    delete process.env.CORS_ORIGINS;
  });

  describe('AC-01: OPTIONS preflight returns CORS headers', () => {
    it('should return CORS headers on OPTIONS preflight from allowed origin', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/me')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type');

      // OPTIONS returns 204 No Content with CORS headers
      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    });

    it('should return CORS headers for second allowed origin', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/me')
        .set('Origin', 'http://localhost:3002')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3002');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('AC-02: GET request with allowed origin permits credentials', () => {
    it('should include CORS headers on actual GET request', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Origin', 'http://localhost:3001');

      // Even 401 (no session) should have CORS headers
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should include CORS headers on POST request', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Origin', 'http://localhost:3001');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('AC-05: Request from disallowed origin blocked', () => {
    it('should NOT return CORS headers for disallowed origin', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Origin', 'http://evil.com');

      // Request might succeed (401 for no auth) but CORS headers should NOT be present
      // Browser would block this, but server-side test just checks headers
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should NOT return CORS headers for origin not in list', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/me')
        .set('Origin', 'http://attacker.com')
        .set('Access-Control-Request-Method', 'GET');

      // NestJS returns 204 but without CORS Allow headers for disallowed origins
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('AC-06: Set-Cookie exposed in headers', () => {
    it('should expose Set-Cookie in Access-Control-Expose-Headers', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/me')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-expose-headers']).toContain('Set-Cookie');
    });
  });

  describe('CORS with different HTTP methods', () => {
    it('should allow PATCH method', async () => {
      const response = await request(app.getHttpServer())
        .options('/merchants/me')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'PATCH');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-methods']).toContain('PATCH');
    });

    it('should allow PUT method', async () => {
      const response = await request(app.getHttpServer())
        .options('/merchants/me/playbook')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'PUT');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-methods']).toContain('PUT');
    });

    it('should allow DELETE method', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/products/123')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'DELETE');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-methods']).toContain('DELETE');
    });
  });

  describe('CORS allowed headers', () => {
    it('should allow x-api-key header', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/products')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'x-api-key');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-headers'].toLowerCase()).toContain('x-api-key');
    });

    it('should allow Authorization header', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/products')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-headers'].toLowerCase()).toContain(
        'authorization',
      );
    });

    it('should allow Cookie header', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/me')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Cookie');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-headers'].toLowerCase()).toContain('cookie');
    });
  });
});
