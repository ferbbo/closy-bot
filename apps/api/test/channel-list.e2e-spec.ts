import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { ChannelType, ChannelStatus } from '@prisma/client';

/**
 * E2E tests for Channel List endpoint
 * PR-16: AC-01, AC-02, AC-03, AC-05
 */
describe('AC-01: GET /channels authenticated with session returns channel list', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let merchantId1: string;
  let merchantId2: string;
  let sessionId1: string;
  let channelId1: string;
  let channelId2: string;
  let inactiveChannelId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use(cookieParser()); // Required for session cookies
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up database
    await prisma.session.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.merchantIdentity.deleteMany();
    await prisma.merchant.deleteMany();

    // Create merchant 1 with channels
    const merchant1 = await prisma.merchant.create({
      data: {
        name: 'Merchant 1',
        whatsappNumber: '+573001111111',
        apiKey: 'key1',
      },
    });
    merchantId1 = merchant1.id;

    // Create merchant 2 without channels
    const merchant2 = await prisma.merchant.create({
      data: {
        name: 'Merchant 2',
        whatsappNumber: '+573002222222',
        apiKey: 'key2',
      },
    });
    merchantId2 = merchant2.id;

    // Create session for merchant 1
    const session1 = await prisma.session.create({
      data: {
        sessionId: 'sess_merchant1',
        merchantId: merchantId1,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    sessionId1 = session1.sessionId;

    // Create channels for merchant 1
    const channel1 = await prisma.channel.create({
      data: {
        merchantId: merchantId1,
        type: ChannelType.WHATSAPP,
        externalId: 'phone_123',
        displayName: 'Sucursal Centro',
        status: ChannelStatus.connected,
        webhookSubscribed: true,
        lastWebhookAt: new Date('2026-02-19T10:00:00Z'),
        credentials: { accessToken: 'secret_token_1', appSecret: 'secret_1' },
        isActive: true,
        createdAt: new Date('2026-02-19T08:00:00Z'), // Más reciente
      },
    });
    channelId1 = channel1.id;

    const channel2 = await prisma.channel.create({
      data: {
        merchantId: merchantId1,
        type: ChannelType.WHATSAPP,
        externalId: 'phone_456',
        displayName: 'Sucursal Norte',
        status: ChannelStatus.error,
        webhookSubscribed: false,
        lastWebhookAt: null,
        credentials: { accessToken: 'secret_token_2', appSecret: 'secret_2' },
        isActive: true,
        createdAt: new Date('2026-02-18T08:00:00Z'), // Más antiguo
      },
    });
    channelId2 = channel2.id;

    // Create inactive channel (should be filtered out - AC-05)
    const inactiveChannel = await prisma.channel.create({
      data: {
        merchantId: merchantId1,
        type: ChannelType.WHATSAPP,
        externalId: 'phone_inactive',
        displayName: 'Inactive Channel',
        status: ChannelStatus.connected,
        webhookSubscribed: true,
        lastWebhookAt: new Date('2026-02-15T10:00:00Z'),
        credentials: { accessToken: 'secret_token_inactive', appSecret: 'secret_inactive' },
        isActive: false, // Should NOT appear in list
      },
    });
    inactiveChannelId = inactiveChannel.id;
  });

  it('should return channel list with valid session (AC-01)', async () => {
    const response = await request(app.getHttpServer())
      .get('/channels')
      .set('Cookie', [`session_id=${sessionId1}`])
      .expect(200);

    expect(response.body).toHaveLength(2);

    // Verify first channel
    expect(response.body[0]).toMatchObject({
      id: channelId1,
      type: 'WHATSAPP',
      displayName: 'Sucursal Centro',
      status: 'connected',
      webhookSubscribed: true,
    });
    expect(response.body[0].lastWebhookAt).toBe('2026-02-19T10:00:00.000Z');
    expect(response.body[0].createdAt).toBeDefined();

    // Verify second channel
    expect(response.body[1]).toMatchObject({
      id: channelId2,
      type: 'WHATSAPP',
      displayName: 'Sucursal Norte',
      status: 'error',
      webhookSubscribed: false,
      lastWebhookAt: null,
    });

    // AC-04: Verify credentials are NOT exposed
    expect(response.body[0]).not.toHaveProperty('credentials');
    expect(response.body[0]).not.toHaveProperty('accessToken');
    expect(response.body[0]).not.toHaveProperty('appSecret');
    expect(response.body[0]).not.toHaveProperty('merchantId');
    expect(response.body[0]).not.toHaveProperty('externalId');
  });

  it('should return 401 without session (AC-02)', async () => {
    await request(app.getHttpServer()).get('/channels').expect(401);
  });

  it('should return empty array for merchant without channels (AC-03)', async () => {
    // Create session for merchant 2 (no channels)
    const session2 = await prisma.session.create({
      data: {
        sessionId: 'sess_merchant2',
        merchantId: merchantId2,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const response = await request(app.getHttpServer())
      .get('/channels')
      .set('Cookie', [`session_id=${session2.sessionId}`])
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('should filter inactive channels (AC-05)', async () => {
    const response = await request(app.getHttpServer())
      .get('/channels')
      .set('Cookie', [`session_id=${sessionId1}`])
      .expect(200);

    // Should return only 2 active channels, not the inactive one
    expect(response.body).toHaveLength(2);

    const channelIds = response.body.map((ch: { id: string }) => ch.id);
    expect(channelIds).toContain(channelId1);
    expect(channelIds).toContain(channelId2);
    expect(channelIds).not.toContain(inactiveChannelId);
  });

  it('should only return channels for authenticated merchant', async () => {
    // Create another merchant with a channel
    const merchant3 = await prisma.merchant.create({
      data: {
        name: 'Merchant 3',
        whatsappNumber: '+573003333333',
        apiKey: 'key3',
      },
    });

    await prisma.channel.create({
      data: {
        merchantId: merchant3.id,
        type: ChannelType.WHATSAPP,
        externalId: 'phone_merchant3',
        displayName: 'Merchant 3 Channel',
        status: ChannelStatus.connected,
        webhookSubscribed: true,
        lastWebhookAt: new Date(),
        credentials: { accessToken: 'secret', appSecret: 'secret' },
        isActive: true,
      },
    });

    // Use merchant1's session - should NOT see merchant3's channel
    const response = await request(app.getHttpServer())
      .get('/channels')
      .set('Cookie', [`session_id=${sessionId1}`])
      .expect(200);

    expect(response.body).toHaveLength(2); // Only merchant1's channels
    expect(
      response.body.every((ch: { id: string }) => ch.id === channelId1 || ch.id === channelId2),
    ).toBe(true);
  });

  it('should return 401 with expired session', async () => {
    // Create expired session
    const expiredSession = await prisma.session.create({
      data: {
        sessionId: 'sess_expired',
        merchantId: merchantId1,
        expiresAt: new Date(Date.now() - 1000), // Expired
      },
    });

    await request(app.getHttpServer())
      .get('/channels')
      .set('Cookie', [`session_id=${expiredSession.sessionId}`])
      .expect(401);
  });
});
