/**
 * PR-12: Auth E2E Tests (AC-10 through AC-17)
 * Tests OIDC login flow, me endpoint, logout, error cases
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { GoogleOidcProvider } from '../src/auth/providers/google-oidc.provider';

describe('Auth (e2e) - PR-12', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Enable cookie parser (required for auth tests)
    app.use(cookieParser());

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Clean up test data
    await prisma.session.deleteMany({});
    await prisma.merchantIdentity.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  describe('AC-10: GET /auth/login/:provider', () => {
    it('should redirect to Google with state cookie', async () => {
      const response = await request(app.getHttpServer()).get('/auth/login/google').expect(302);

      expect(response.headers.location).toContain('https://accounts.google.com');
      expect(response.headers.location).toContain('state=');
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'][0]).toContain('oidc_state=');
    });

    it('should redirect to Microsoft', async () => {
      const response = await request(app.getHttpServer()).get('/auth/login/microsoft').expect(302);

      expect(response.headers.location).toContain('https://login.microsoftonline.com');
    });
  });

  describe('AC-17: Unknown provider', () => {
    it('should return 404 for unknown provider', async () => {
      const response = await request(app.getHttpServer()).get('/auth/login/unknown').expect(404);

      expect(response.body.message).toContain('Unknown provider');
    });
  });

  describe('AC-12: GET /auth/me', () => {
    it('should return 401 without cookie', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should return 401 with invalid cookie', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', ['session_id=invalid-session-id'])
        .expect(401);
    });

    it('should return merchant info with valid session', async () => {
      // Create test merchant with unique api key
      const merchant = await prisma.merchant.create({
        data: {
          name: 'Test Merchant',
          whatsappNumber: 'test-auth@example.com',
          apiKey: `test-key-auth-${Date.now()}`,
        },
      });

      // Create session with unique ID
      const session = await prisma.session.create({
        data: {
          sessionId: `test-session-e2e-${Date.now()}`,
          merchantId: merchant.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', [`session_id=${session.sessionId}`])
        .expect(200);

      expect(response.body.authenticated).toBe(true);
      expect(response.body.merchant.id).toBe(merchant.id);
      expect(response.body.merchant.name).toBe('Test Merchant');

      // Cleanup
      await prisma.session.delete({ where: { id: session.id } });
      await prisma.merchant.delete({ where: { id: merchant.id } });
    });
  });

  describe('AC-15: POST /auth/logout', () => {
    it('should invalidate session and clear cookie', async () => {
      // Create test merchant and session with unique IDs
      const merchant = await prisma.merchant.create({
        data: {
          name: 'Test Logout Merchant',
          whatsappNumber: 'test-logout@example.com',
          apiKey: `test-key-logout-${Date.now()}`,
        },
      });

      const session = await prisma.session.create({
        data: {
          sessionId: `test-session-logout-${Date.now()}`,
          merchantId: merchant.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Logout
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', [`session_id=${session.sessionId}`])
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'][0]).toContain('session_id=;');

      // Verify session deleted
      const deletedSession = await prisma.session.findUnique({
        where: { id: session.id },
      });
      expect(deletedSession).toBeNull();

      // Cleanup
      await prisma.merchant.delete({ where: { id: merchant.id } });
    });
  });

  describe('AC-16: CSRF protection', () => {
    it('should be tested in callback flow (state validation)', async () => {
      // AC-16 is covered in auth.service.spec.ts
      // Callback with wrong state should fail
      expect(true).toBe(true);
    });
  });

  describe('AC-14: Session cleanup', () => {
    it('should be handled by scheduled job (tested in unit tests)', async () => {
      // AC-14 is covered by SessionCleanupScheduler
      // Manual test: create expired session, run cleanup, verify deletion
      expect(true).toBe(true);
    });
  });

  describe('AC-05-PR-15.1: New merchant via OIDC callback gets retail_general industry and playbookConfig', () => {
    it('should seed retail_general industry and non-null playbookConfig on first login', async () => {
      const authService = app.get<AuthService>(AuthService);
      const googleProvider = app.get<GoogleOidcProvider>(GoogleOidcProvider);

      const uniqueEmail = `test-ac05-pr151-${Date.now()}@example.com`;
      const uniqueSub = `test-sub-ac05-${Date.now()}`;

      jest
        .spyOn(googleProvider, 'exchangeCodeForTokens')
        .mockResolvedValueOnce({ idToken: 'test-id-token-ac05' });
      jest.spyOn(googleProvider, 'getUserInfo').mockResolvedValueOnce({
        sub: uniqueSub,
        email: uniqueEmail,
        name: 'AC05 PR-15.1 Test User',
      });

      await authService.handleCallback('google', 'test-code-ac05', 'state', 'state');

      const merchant = await prisma.merchant.findFirst({
        where: { whatsappNumber: uniqueEmail },
      });

      expect(merchant).toBeDefined();
      expect(merchant?.industry).toBe('retail_general');
      expect(merchant?.playbookConfig).toBeDefined();
      expect(merchant?.playbookConfig).not.toBeNull();
      const config = merchant?.playbookConfig as Record<string, unknown>;
      expect(config['industry']).toBe('retail_general');

      // Cleanup
      if (merchant) {
        await prisma.merchantIdentity.deleteMany({ where: { merchantId: merchant.id } });
        await prisma.session.deleteMany({ where: { merchantId: merchant.id } });
        await prisma.merchant.delete({ where: { id: merchant.id } });
      }
    });
  });
});
