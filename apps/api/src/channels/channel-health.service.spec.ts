import { Test, TestingModule } from '@nestjs/testing';
import { ChannelHealthService } from './channel-health.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { MetaEmbeddedSignupProvider } from '../onboarding/providers/meta-embedded-signup.provider';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Channel, ChannelStatus } from '@prisma/client';

/**
 * Unit tests for ChannelHealthService
 * AC-02, AC-03, AC-06, AC-07, AC-10, AC-15
 */
describe('ChannelHealthService', () => {
  let service: ChannelHealthService;
  let prisma: PrismaService;
  let metaProvider: MetaEmbeddedSignupProvider;

  const mockChannel: Channel = {
    id: 'ch_123',
    merchantId: 'merch_123',
    type: 'WHATSAPP',
    externalId: 'phone_123',
    displayName: 'Test Channel',
    credentials: {
      accessToken: 'token_123',
      phoneNumberId: 'phone_123',
      wabaId: 'waba_123',
    },
    isActive: true,
    wabaId: 'waba_123',
    status: 'connected' as ChannelStatus,
    statusReason: null,
    webhookSubscribed: true,
    lastWebhookAt: new Date('2026-01-01'),
    lastErrorAt: null,
    errorCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelHealthService,
        {
          provide: PrismaService,
          useValue: {
            channel: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: MetaEmbeddedSignupProvider,
          useValue: {
            subscribeWebhook: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChannelHealthService>(ChannelHealthService);
    prisma = module.get<PrismaService>(PrismaService);
    metaProvider = module.get<MetaEmbeddedSignupProvider>(MetaEmbeddedSignupProvider);
  });

  describe('AC-02: getHealth() returns ChannelHealthDto', () => {
    it('should return health dto for healthy channel', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(mockChannel);

      const result = await service.getHealth('ch_123', 'merch_123');

      expect(result).toMatchObject({
        channelId: 'ch_123',
        status: 'connected',
        webhookSubscribed: true,
        errorCount: 0,
        recommendation: null,
      });
    });

    it('should throw NotFoundException for non-existent channel', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(null);

      await expect(service.getHealth('ch_999', 'merch_123')).rejects.toThrow(NotFoundException);
    });

    it('should include recentErrors from statusReason', async () => {
      const channelWithErrors = {
        ...mockChannel,
        statusReason: 'Error 1\nError 2\nError 3',
        errorCount: 3,
      };
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(channelWithErrors);

      const result = await service.getHealth('ch_123', 'merch_123');

      expect(result.recentErrors).toEqual(['Error 1', 'Error 2', 'Error 3']);
    });
  });

  describe('AC-03: Recommendation logic', () => {
    it('should recommend webhook resubscription when not subscribed', async () => {
      const channel = {
        ...mockChannel,
        webhookSubscribed: false,
        status: 'connected' as ChannelStatus,
      };
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(channel);

      const result = await service.getHealth('ch_123', 'merch_123');

      expect(result.recommendation).toBe('resubscribe_webhook');
    });

    it('should recommend refresh_credentials for token errors', async () => {
      const channel = {
        ...mockChannel,
        status: 'error' as ChannelStatus,
        statusReason: 'Invalid token',
      };
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(channel);

      const result = await service.getHealth('ch_123', 'merch_123');

      expect(result.recommendation).toBe('refresh_credentials');
    });

    it('should recommend check_permissions for permission errors', async () => {
      const channel = {
        ...mockChannel,
        status: 'error' as ChannelStatus,
        statusReason: 'Permission denied',
      };
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(channel);

      const result = await service.getHealth('ch_123', 'merch_123');

      expect(result.recommendation).toBe('check_permissions');
    });

    it('should recommend check_permissions for high error count', async () => {
      const channel = { ...mockChannel, errorCount: 6 };
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(channel);

      const result = await service.getHealth('ch_123', 'merch_123');

      expect(result.recommendation).toBe('check_permissions');
    });

    it('should return null recommendation for pending status', async () => {
      const channel = { ...mockChannel, status: 'pending' as ChannelStatus };
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(channel);

      const result = await service.getHealth('ch_123', 'merch_123');

      expect(result.recommendation).toBeNull();
    });
  });

  describe('AC-06: retryWebhookSubscription() with success', () => {
    it('should update channel on successful webhook subscription', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(mockChannel);
      jest.spyOn(metaProvider, 'subscribeWebhook').mockResolvedValue({ success: true });
      const updateSpy = jest.spyOn(prisma.channel, 'update').mockResolvedValue(mockChannel);

      const result = await service.retryWebhookSubscription('ch_123', 'merch_123');

      expect(result.success).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ch_123' },
          data: expect.objectContaining({
            status: 'connected',
            webhookSubscribed: true,
            errorCount: 0,
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent channel', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(null);

      await expect(service.retryWebhookSubscription('ch_999', 'merch_123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when channel has no WABA ID', async () => {
      const channelNoWaba = { ...mockChannel, wabaId: null };
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(channelNoWaba);

      await expect(service.retryWebhookSubscription('ch_123', 'merch_123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('AC-07: retryWebhookSubscription() with failure + backoff', () => {
    it('should retry 3 times with exponential backoff on failure', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(mockChannel);
      const subscribeSpy = jest
        .spyOn(metaProvider, 'subscribeWebhook')
        .mockResolvedValue({ success: false, error: 'Network error' });
      const updateSpy = jest.spyOn(prisma.channel, 'update').mockResolvedValue(mockChannel);

      // Mock sleep to avoid waiting
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      const result = await service.retryWebhookSubscription('ch_123', 'merch_123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed after 3 attempts');
      expect(subscribeSpy).toHaveBeenCalledTimes(3);
      // Verify errorCount incremented
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorCount: { increment: 1 },
          }),
        }),
      );
    });

    it('AC-15: should use delays [1000, 2000, 4000] for backoff', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(mockChannel);
      jest
        .spyOn(metaProvider, 'subscribeWebhook')
        .mockResolvedValue({ success: false, error: 'Error' });
      jest.spyOn(prisma.channel, 'update').mockResolvedValue(mockChannel);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sleepSpy = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await service.retryWebhookSubscription('ch_123', 'merch_123');

      // Should sleep twice (not on 3rd/last attempt)
      expect(sleepSpy).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);
    });
  });

  describe('AC-10: refreshChannelStatus() from Meta API', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should update status to connected on 200 response', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(mockChannel);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
      const updateSpy = jest.spyOn(prisma.channel, 'update').mockResolvedValue(mockChannel);

      const result = await service.refreshChannelStatus('ch_123', 'merch_123');

      expect(result.success).toBe(true);
      expect(result.status).toBe('connected');
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'connected',
            errorCount: 0,
          }),
        }),
      );
    });

    it('should update status to error on 401 response', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(mockChannel);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
      const updateSpy = jest.spyOn(prisma.channel, 'update').mockResolvedValue(mockChannel);

      const result = await service.refreshChannelStatus('ch_123', 'merch_123');

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'error',
            statusReason: 'Invalid credentials or permissions',
            errorCount: { increment: 1 },
          }),
        }),
      );
    });

    it('should update status to error on 404 response', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(mockChannel);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });
      const updateSpy = jest.spyOn(prisma.channel, 'update').mockResolvedValue(mockChannel);

      const result = await service.refreshChannelStatus('ch_123', 'merch_123');

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusReason: 'Phone number not found',
          }),
        }),
      );
    });

    it('should preserve status on network error', async () => {
      jest.spyOn(prisma.channel, 'findFirst').mockResolvedValue(mockChannel);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await service.refreshChannelStatus('ch_123', 'merch_123');

      expect(result.success).toBe(false);
      expect(result.status).toBe('connected'); // Preserved from mockChannel
    });
  });
});
