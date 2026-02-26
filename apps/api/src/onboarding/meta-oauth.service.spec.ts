import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MetaOAuthService } from './meta-oauth.service';
import { MetaEmbeddedSignupProvider } from './providers/meta-embedded-signup.provider';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { FeatureFlagsService } from '../common/feature-flags/feature-flags.service';

/**
 * Unit tests for MetaOAuthService
 * AC-04, AC-05: Multi-channel gating (PR-MVP-01)
 * AC-14: should handle callback successfully
 * AC-15: subscription failure -> status=connected but webhookSubscribed=false
 */
describe('AC-14, AC-15: MetaOAuthService', () => {
  let service: MetaOAuthService;

  const mockPrismaService = {
    channel: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockMetaProvider = {
    getAuthorizationUrl: jest.fn(),
    exchangeCodeForToken: jest.fn(),
    fetchWabaInfo: jest.fn(),
    subscribeWebhook: jest.fn(),
  };

  // Default: MVP mode (all B2 flags = false)
  const mockFeatureFlags = {
    isMultiChannelEnabled: false,
  };

  function buildModule(featureFlagsOverride?: Partial<typeof mockFeatureFlags>) {
    return Test.createTestingModule({
      providers: [
        MetaOAuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MetaEmbeddedSignupProvider, useValue: mockMetaProvider },
        {
          provide: FeatureFlagsService,
          useValue: { ...mockFeatureFlags, ...featureFlagsOverride },
        },
      ],
    }).compile();
  }

  beforeEach(async () => {
    const module: TestingModule = await buildModule();
    service = module.get<MetaOAuthService>(MetaOAuthService);
    jest.clearAllMocks();
  });

  describe('startOnboarding', () => {
    it('should generate state and auth URL', () => {
      mockMetaProvider.getAuthorizationUrl.mockReturnValue('https://facebook.com/oauth');

      const result = service.startOnboarding();

      expect(result.state).toBeDefined();
      expect(result.state).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(result.authUrl).toBe('https://facebook.com/oauth');
      expect(mockMetaProvider.getAuthorizationUrl).toHaveBeenCalledWith(
        result.state,
        expect.stringContaining('/callback'),
      );
    });
  });

  describe('AC-14: handleCallback - happy path', () => {
    it('should exchange code, fetch WABA, create channel, and subscribe webhook', async () => {
      const code = 'test-code';
      const merchantId = 'merchant-123';

      // Mock provider responses
      mockMetaProvider.exchangeCodeForToken.mockResolvedValue({
        access_token: 'mock-token',
        token_type: 'bearer',
      });

      mockMetaProvider.fetchWabaInfo.mockResolvedValue({
        id: 'waba-123',
        name: 'Test WABA',
        phone_numbers: [
          {
            id: 'phone-123',
            display_phone_number: '+573001234567',
            verified_name: 'Test Business',
          },
        ],
      });

      mockMetaProvider.subscribeWebhook.mockResolvedValue({ success: true });

      // Mock Prisma: no existing channel
      mockPrismaService.channel.findUnique.mockResolvedValue(null);
      mockPrismaService.channel.create.mockResolvedValue({
        id: 'channel-123',
        merchantId,
        type: 'WHATSAPP',
        externalId: 'phone-123',
        displayName: 'Test Business',
        wabaId: 'waba-123',
        status: 'pending',
      });
      mockPrismaService.channel.update.mockResolvedValue({
        id: 'channel-123',
        status: 'connected',
        webhookSubscribed: true,
      });

      const result = await service.handleCallback(code, merchantId);

      expect(result.channelId).toBe('channel-123');
      expect(result.displayName).toBe('Test Business');
      expect(mockMetaProvider.exchangeCodeForToken).toHaveBeenCalledWith(code, expect.any(String));
      expect(mockMetaProvider.fetchWabaInfo).toHaveBeenCalled();
      expect(mockPrismaService.channel.create).toHaveBeenCalled();
      expect(mockMetaProvider.subscribeWebhook).toHaveBeenCalledWith(
        'waba-123',
        'mock-token',
        expect.any(String),
        expect.any(String),
      );
      expect(mockPrismaService.channel.update).toHaveBeenCalledWith({
        where: { id: 'channel-123' },
        data: expect.objectContaining({
          status: 'connected',
          webhookSubscribed: true,
        }),
      });
    });
  });

  describe('AC-15: handleCallback - webhook subscription failure', () => {
    it('should create channel with status=connected but webhookSubscribed=false on subscription failure', async () => {
      const code = 'test-code';
      const merchantId = 'merchant-123';

      mockMetaProvider.exchangeCodeForToken.mockResolvedValue({
        access_token: 'mock-token',
        token_type: 'bearer',
      });

      mockMetaProvider.fetchWabaInfo.mockResolvedValue({
        id: 'waba-123',
        name: 'Test WABA',
        phone_numbers: [
          {
            id: 'phone-123',
            display_phone_number: '+573001234567',
            verified_name: 'Test Business',
          },
        ],
      });

      // Webhook subscription fails
      mockMetaProvider.subscribeWebhook.mockResolvedValue({
        success: false,
        error: 'Meta API error',
      });

      mockPrismaService.channel.findUnique.mockResolvedValue(null);
      mockPrismaService.channel.create.mockResolvedValue({
        id: 'channel-123',
        merchantId,
        type: 'WHATSAPP',
        status: 'pending',
      });
      mockPrismaService.channel.update.mockResolvedValue({
        id: 'channel-123',
        status: 'connected',
        webhookSubscribed: false,
      });

      const result = await service.handleCallback(code, merchantId);

      expect(result.channelId).toBe('channel-123');
      // Verify channel updated with connected status but webhookSubscribed=false
      expect(mockPrismaService.channel.update).toHaveBeenCalledWith({
        where: { id: 'channel-123' },
        data: expect.objectContaining({
          status: 'connected',
          webhookSubscribed: false,
          statusReason: expect.stringContaining('failed'),
        }),
      });
    });
  });

  describe('AC-12: phone_number_id duplicate (different merchant)', () => {
    it('should throw ConflictException if phone number belongs to another merchant', async () => {
      const code = 'test-code';
      const merchantId = 'merchant-123';

      mockMetaProvider.exchangeCodeForToken.mockResolvedValue({
        access_token: 'mock-token',
        token_type: 'bearer',
      });

      mockMetaProvider.fetchWabaInfo.mockResolvedValue({
        id: 'waba-123',
        name: 'Test WABA',
        phone_numbers: [
          {
            id: 'phone-123',
            display_phone_number: '+573001234567',
            verified_name: 'Test Business',
          },
        ],
      });

      // Existing channel belongs to different merchant
      mockPrismaService.channel.findUnique.mockResolvedValue({
        id: 'existing-channel',
        merchantId: 'other-merchant',
        type: 'WHATSAPP',
        externalId: 'phone-123',
      });

      await expect(service.handleCallback(code, merchantId)).rejects.toThrow(ConflictException);
      await expect(service.handleCallback(code, merchantId)).rejects.toThrow(
        'already connected to another merchant',
      );
    });
  });

  describe('AC-13: phone_number_id duplicate (same merchant - idempotent)', () => {
    it('should update credentials if phone number already belongs to same merchant', async () => {
      const code = 'test-code';
      const merchantId = 'merchant-123';

      mockMetaProvider.exchangeCodeForToken.mockResolvedValue({
        access_token: 'new-token',
        token_type: 'bearer',
      });

      mockMetaProvider.fetchWabaInfo.mockResolvedValue({
        id: 'waba-123',
        name: 'Test WABA',
        phone_numbers: [
          {
            id: 'phone-123',
            display_phone_number: '+573001234567',
            verified_name: 'Test Business Updated',
          },
        ],
      });

      mockMetaProvider.subscribeWebhook.mockResolvedValue({ success: true });

      // Existing channel belongs to same merchant
      mockPrismaService.channel.findUnique.mockResolvedValue({
        id: 'existing-channel',
        merchantId: merchantId,
        type: 'WHATSAPP',
        externalId: 'phone-123',
      });
      mockPrismaService.channel.update.mockResolvedValue({
        id: 'existing-channel',
        merchantId: merchantId,
        displayName: 'Test Business Updated',
        status: 'connected',
      });

      const result = await service.handleCallback(code, merchantId);

      expect(result.channelId).toBe('existing-channel');
      expect(result.displayName).toBe('Test Business Updated');
      expect(mockPrismaService.channel.update).toHaveBeenCalledWith({
        where: { id: 'existing-channel' },
        data: expect.objectContaining({
          credentials: expect.objectContaining({
            accessToken: 'new-token',
          }),
          displayName: 'Test Business Updated',
        }),
      });
    });
  });

  describe('retryWebhookSubscription', () => {
    it('should retry webhook subscription successfully', async () => {
      const channelId = 'channel-123';
      const merchantId = 'merchant-123';

      mockPrismaService.channel.findFirst.mockResolvedValue({
        id: channelId,
        merchantId,
        wabaId: 'waba-123',
        credentials: { accessToken: 'mock-token' },
      });

      mockMetaProvider.subscribeWebhook.mockResolvedValue({ success: true });
      mockPrismaService.channel.update.mockResolvedValue({
        id: channelId,
        webhookSubscribed: true,
      });

      const result = await service.retryWebhookSubscription(channelId, merchantId);

      expect(result.success).toBe(true);
      expect(mockPrismaService.channel.update).toHaveBeenCalledWith({
        where: { id: channelId },
        data: expect.objectContaining({
          webhookSubscribed: true,
        }),
      });
    });
  });

  // ──────────────────────────────────────────────────────────
  // AC-04 / AC-05: Multi-channel gating (PR-MVP-01)
  // ──────────────────────────────────────────────────────────
  describe('AC-04: blocks second channel creation when mode=mvp', () => {
    it('throws ForbiddenException when merchant has 1 channel and FEATURES_MODE=mvp', async () => {
      // isMultiChannelEnabled = false (MVP default)
      const code = 'test-code';
      const merchantId = 'merchant-123';

      mockMetaProvider.exchangeCodeForToken.mockResolvedValue({ access_token: 'mock-token' });
      mockMetaProvider.fetchWabaInfo.mockResolvedValue({
        id: 'waba-123',
        name: 'Test WABA',
        phone_numbers: [{ id: 'phone-456', display_phone_number: '+1234', verified_name: 'Biz' }],
      });

      // No existing channel with this phone number (new channel for this merchant)
      mockPrismaService.channel.findUnique.mockResolvedValue(null);
      // Merchant already has 1 channel
      mockPrismaService.channel.count.mockResolvedValue(1);

      await expect(service.handleCallback(code, merchantId)).rejects.toThrow(ForbiddenException);
      await expect(service.handleCallback(code, merchantId)).rejects.toThrow(
        'Multi-channel requires enterprise plan',
      );
    });
  });

  describe('AC-05: merchant with 1 existing channel cannot create another in MVP', () => {
    it('the gating check uses channel.count for the merchant', async () => {
      const code = 'test-code';
      const merchantId = 'merchant-abc';

      mockMetaProvider.exchangeCodeForToken.mockResolvedValue({ access_token: 'tok' });
      mockMetaProvider.fetchWabaInfo.mockResolvedValue({
        id: 'waba-1',
        name: 'WABA',
        phone_numbers: [{ id: 'phone-999', display_phone_number: '+999', verified_name: 'X' }],
      });
      mockPrismaService.channel.findUnique.mockResolvedValue(null); // no conflict
      mockPrismaService.channel.count.mockResolvedValue(2); // 2 existing channels

      await expect(service.handleCallback(code, merchantId)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.channel.count).toHaveBeenCalledWith({
        where: { merchantId },
      });
    });
  });

  describe('AC-04 (dev mode): allows second channel when isMultiChannelEnabled=true', () => {
    it('does NOT throw when mode=dev and MULTI_CHANNEL_ENABLED=true', async () => {
      // Build service with isMultiChannelEnabled = true
      const module = await buildModule({ isMultiChannelEnabled: true });
      const devService = module.get<MetaOAuthService>(MetaOAuthService);
      jest.clearAllMocks();

      const code = 'test-code';
      const merchantId = 'merchant-dev';

      mockMetaProvider.exchangeCodeForToken.mockResolvedValue({ access_token: 'tok' });
      mockMetaProvider.fetchWabaInfo.mockResolvedValue({
        id: 'waba-1',
        name: 'WABA',
        phone_numbers: [{ id: 'phone-777', display_phone_number: '+777', verified_name: 'Dev' }],
      });
      mockMetaProvider.subscribeWebhook.mockResolvedValue({ success: true });
      mockPrismaService.channel.findUnique.mockResolvedValue(null);
      mockPrismaService.channel.count.mockResolvedValue(3); // many channels
      mockPrismaService.channel.create.mockResolvedValue({
        id: 'new-ch',
        displayName: 'Dev',
        status: 'pending',
      });
      mockPrismaService.channel.update.mockResolvedValue({ id: 'new-ch', status: 'connected' });

      // Should NOT throw
      const result = await devService.handleCallback(code, merchantId);
      expect(result.channelId).toBe('new-ch');
      // count should NOT be called (gating skipped)
      expect(mockPrismaService.channel.count).not.toHaveBeenCalled();
    });
  });
});
