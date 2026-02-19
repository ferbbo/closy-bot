import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';

/**
 * E2E tests for WhatsApp Onboarding (Meta Embedded Signup)
 *
 * AC-04: GET /onboarding/whatsapp/start -> 302 + state cookie
 * AC-05: State cookie has correct attributes
 * AC-06: Callback with valid state creates Channel
 * AC-07: Callback with state mismatch -> 403 (redirect with error)
 * AC-08: Channel includes wabaId, phoneNumberId, status
 * AC-10: Retry webhook subscription endpoint works
 * AC-11: All endpoints require SessionAuthGuard (401 without session)
 * AC-12: phone_number_id duplicated for another merchant -> 409
 * AC-13: phone_number_id duplicated for same merchant -> update (idempotent)
 */
describe('WhatsApp Onboarding E2E (PR-13)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Set dummy env vars for module compilation
    process.env.META_APP_ID = 'test-app-id';
    process.env.META_APP_SECRET = 'test-app-secret';
    process.env.META_CONFIG_ID = 'test-config-id';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('AC-11: Authentication required', () => {
    it('should return 401 for /start without session', async () => {
      await request(app.getHttpServer()).get('/onboarding/whatsapp/start').expect(401);
    });

    it('should return 401 for retry endpoint without session', async () => {
      await request(app.getHttpServer())
        .post('/onboarding/whatsapp/channel-123/subscribe-webhook')
        .expect(401);
    });
  });

  describe('AC-04, AC-05: Start OAuth flow', () => {
    let sessionCookie: string;

    beforeEach(async () => {
      // Create merchant + session for auth
      const merchant = await prisma.merchant.create({
        data: {
          name: 'Test Merchant',
          whatsappNumber: '+573001111111',
          apiKey: 'test-api-key',
        },
      });

      await prisma.session.create({
        data: {
          sessionId: 'test-session-id',
          merchantId: merchant.id,
          expiresAt: new Date(Date.now() + 86400000), // 24h
        },
      });

      sessionCookie = `session_id=test-session-id`;
    });

    afterEach(async () => {
      await prisma.session.deleteMany({});
      await prisma.merchant.deleteMany({});
    });

    it('AC-04: should redirect to Meta and set state cookie', async () => {
      const response = await request(app.getHttpServer())
        .get('/onboarding/whatsapp/start')
        .set('Cookie', sessionCookie)
        .expect(302);

      // Check redirect location
      expect(response.headers.location).toContain('facebook.com');
      expect(response.headers.location).toContain('oauth');

      // AC-05: Check state cookie attributes
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const stateCookie = cookies.find((c: string) => c.startsWith('meta_oauth_state'));
      expect(stateCookie).toBeDefined();
      expect(stateCookie).toContain('HttpOnly');
      expect(stateCookie).toContain('SameSite=Lax');
    });
  });

  describe('AC-06, AC-07, AC-08: OAuth callback', () => {
    let sessionCookie: string;
    let merchantId: string;

    beforeEach(async () => {
      const merchant = await prisma.merchant.create({
        data: {
          name: 'Test Merchant CB',
          whatsappNumber: '+573002222222',
          apiKey: 'test-api-key-cb',
        },
      });
      merchantId = merchant.id;

      await prisma.session.create({
        data: {
          sessionId: 'test-session-cb',
          merchantId: merchant.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      sessionCookie = `session_id=test-session-cb`;
    });

    afterEach(async () => {
      await prisma.channel.deleteMany({});
      await prisma.session.deleteMany({});
      await prisma.merchant.deleteMany({});
    });

    it('AC-06, AC-08: should create Channel on successful callback', async () => {
      const state = 'test-state-uuid';
      const code = 'test-auth-code';

      const response = await request(app.getHttpServer())
        .get(`/onboarding/whatsapp/callback?code=${code}&state=${state}`)
        .set('Cookie', [sessionCookie, `meta_oauth_state=${state}`])
        .expect(302);

      expect(response.headers.location).toContain('status=success');
      expect(response.headers.location).toContain('channelId=');

      // Verify channel created in DB
      const channel = await prisma.channel.findFirst({
        where: {
          merchantId,
          type: 'WHATSAPP',
          externalId: 'phone-456',
        },
      });

      expect(channel).toBeDefined();
      expect(channel.wabaId).toBe('waba-123');
      expect(channel.status).toBe('connected'); // After webhook subscription
      expect(channel.webhookSubscribed).toBe(true);
      expect(channel.displayName).toBe('Test Business');

      const credentials = channel.credentials as Record<string, unknown>;
      expect(credentials.accessToken).toBe('mock-access-token');
      expect(credentials.phoneNumberId).toBe('phone-456');
      expect(credentials.wabaId).toBe('waba-123');
    });

    it('AC-07: should reject callback with state mismatch', async () => {
      const cookieState = 'state-1';
      const queryState = 'state-2';
      const code = 'test-auth-code';

      const response = await request(app.getHttpServer())
        .get(`/onboarding/whatsapp/callback?code=${code}&state=${queryState}`)
        .set('Cookie', [sessionCookie, `meta_oauth_state=${cookieState}`])
        .expect(302);

      expect(response.headers.location).toContain('status=error');
      expect(response.headers.location).toContain('reason=state_mismatch');

      // Verify NO channel created
      const channelCount = await prisma.channel.count({
        where: { merchantId },
      });
      expect(channelCount).toBe(0);
    });
  });

  describe('AC-12, AC-13: Phone number idempotency', () => {
    let merchant1Id: string;
    let sessionCookie1: string;
    let sessionCookie2: string;

    beforeEach(async () => {
      // Merchant 1
      const merchant1 = await prisma.merchant.create({
        data: {
          name: 'Merchant 1',
          whatsappNumber: '+573003333333',
          apiKey: 'api-key-1',
        },
      });
      merchant1Id = merchant1.id;

      await prisma.session.create({
        data: {
          sessionId: 'session-1',
          merchantId: merchant1.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      sessionCookie1 = `session_id=session-1`;

      // Merchant 2
      const merchant2 = await prisma.merchant.create({
        data: {
          name: 'Merchant 2',
          whatsappNumber: '+573004444444',
          apiKey: 'api-key-2',
        },
      });

      await prisma.session.create({
        data: {
          sessionId: 'session-2',
          merchantId: merchant2.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      sessionCookie2 = `session_id=session-2`;
    });

    afterEach(async () => {
      await prisma.channel.deleteMany({});
      await prisma.session.deleteMany({});
      await prisma.merchant.deleteMany({});
    });

    it('AC-12: should return 409 if phone number already connected to another merchant', async () => {
      // Create channel for merchant 1
      await prisma.channel.create({
        data: {
          merchantId: merchant1Id,
          type: 'WHATSAPP',
          externalId: 'phone-shared',
          displayName: 'Shared Phone',
          credentials: { accessToken: 'token-1' },
          wabaId: 'waba-shared',
        },
      });

      // Merchant 2 tries to connect same phone number
      mockMetaProvider.fetchWabaInfo.mockResolvedValueOnce({
        id: 'waba-shared',
        name: 'Shared WABA',
        phone_numbers: [
          {
            id: 'phone-shared',
            display_phone_number: '+573005555555',
            verified_name: 'Shared Business',
          },
        ],
      });

      const state = 'test-state-merchant-2';
      const response = await request(app.getHttpServer())
        .get(`/onboarding/whatsapp/callback?code=test-code&state=${state}`)
        .set('Cookie', [sessionCookie2, `meta_oauth_state=${state}`])
        .expect(302);

      expect(response.headers.location).toContain('status=error');
      expect(response.headers.location).toContain('already_connected');
    });

    it('AC-13: should update credentials if same merchant reconnects (idempotent)', async () => {
      // Create initial channel for merchant 1
      const initialChannel = await prisma.channel.create({
        data: {
          merchantId: merchant1Id,
          type: 'WHATSAPP',
          externalId: 'phone-reconnect',
          displayName: 'Initial Name',
          credentials: { accessToken: 'old-token' },
          wabaId: 'waba-reconnect',
          status: 'connected',
        },
      });

      // Merchant 1 reconnects same phone number
      mockMetaProvider.fetchWabaInfo.mockResolvedValueOnce({
        id: 'waba-reconnect',
        name: 'Reconnect WABA',
        phone_numbers: [
          {
            id: 'phone-reconnect',
            display_phone_number: '+573006666666',
            verified_name: 'Updated Name',
          },
        ],
      });

      mockMetaProvider.exchangeCodeForToken.mockResolvedValueOnce({
        access_token: 'new-token',
        token_type: 'bearer',
      });

      const state = 'test-state-reconnect';
      const response = await request(app.getHttpServer())
        .get(`/onboarding/whatsapp/callback?code=test-code&state=${state}`)
        .set('Cookie', [sessionCookie1, `meta_oauth_state=${state}`])
        .expect(302);

      expect(response.headers.location).toContain('status=success');
      expect(response.headers.location).toContain(`channelId=${initialChannel.id}`);

      // Verify channel updated (same ID)
      const updatedChannel = await prisma.channel.findUnique({
        where: { id: initialChannel.id },
      });

      expect(updatedChannel).toBeDefined();
      expect(updatedChannel.displayName).toBe('Updated Name');
      const credentials = updatedChannel.credentials as Record<string, unknown>;
      expect(credentials.accessToken).toBe('new-token');
      expect(updatedChannel.status).toBe('connected');
    });
  });

  describe('AC-10: Retry webhook subscription', () => {
    let sessionCookie: string;
    let channelId: string;

    beforeEach(async () => {
      const merchant = await prisma.merchant.create({
        data: {
          name: 'Merchant Retry',
          whatsappNumber: '+573007777777',
          apiKey: 'api-key-retry',
        },
      });

      await prisma.session.create({
        data: {
          sessionId: 'session-retry',
          merchantId: merchant.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      sessionCookie = `session_id=session-retry`;

      const channel = await prisma.channel.create({
        data: {
          merchantId: merchant.id,
          type: 'WHATSAPP',
          externalId: 'phone-retry',
          displayName: 'RetryChannel',
          credentials: { accessToken: 'retry-token' },
          wabaId: 'waba-retry',
          status: 'connected',
          webhookSubscribed: false,
        },
      });
      channelId = channel.id;
    });

    afterEach(async () => {
      await prisma.channel.deleteMany({});
      await prisma.session.deleteMany({});
      await prisma.merchant.deleteMany({});
    });

    it('AC-10: should retry webhook subscription successfully', async () => {
      mockMetaProvider.subscribeWebhook.mockResolvedValueOnce({ success: true });

      const response = await request(app.getHttpServer())
        .post(`/onboarding/whatsapp/${channelId}/subscribe-webhook`)
        .set('Cookie', sessionCookie)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('successful');

      // Verify channel updated
      const updatedChannel = await prisma.channel.findUnique({
        where: { id: channelId },
      });
      expect(updatedChannel.webhookSubscribed).toBe(true);
    });

    it('should handle retry failure', async () => {
      mockMetaProvider.subscribeWebhook.mockResolvedValueOnce({
        success: false,
        error: 'Meta API error',
      });

      const response = await request(app.getHttpServer())
        .post(`/onboarding/whatsapp/${channelId}/subscribe-webhook`)
        .set('Cookie', sessionCookie)
        .expect(201);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Meta API error');
    });

    it('should return 404 for channel not belonging to merchant', async () => {
      // Create different merchant and session
      const otherMerchant = await prisma.merchant.create({
        data: {
          name: 'Other Merchant',
          whatsappNumber: '+573008888888',
          apiKey: 'other-api-key',
        },
      });

      await prisma.session.create({
        data: {
          sessionId: 'other-session',
          merchantId: otherMerchant.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/onboarding/whatsapp/${channelId}/subscribe-webhook`)
        .set('Cookie', `session_id=other-session`)
        .expect(404);

      expect(response.body.message).toContain('not found or access denied');
    });
  });
});
