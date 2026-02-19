import { Test, TestingModule } from '@nestjs/testing';
import { ChannelHealthController } from './channel-health.controller';
import { ChannelHealthService } from './channel-health.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ChannelOwnershipGuard } from './guards/channel-ownership.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { ChannelHealthDto } from './dto/channel-health.dto';
import { ExecutionContext } from '@nestjs/common';

/**
 * Unit tests for ChannelHealthController
 */
describe('ChannelHealthController', () => {
  let controller: ChannelHealthController;
  let service: ChannelHealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelHealthController],
      providers: [
        {
          provide: ChannelHealthService,
          useValue: {
            getHealth: jest.fn(),
            retryWebhookSubscription: jest.fn(),
            refreshChannelStatus: jest.fn(),
          },
        },
        {
          provide: SessionAuthGuard,
          useValue: {
            canActivate: jest.fn((_context: ExecutionContext) => true),
          },
        },
        {
          provide: ChannelOwnershipGuard,
          useValue: {
            canActivate: jest.fn((_context: ExecutionContext) => true),
          },
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ChannelOwnershipGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChannelHealthController>(ChannelHealthController);
    service = module.get<ChannelHealthService>(ChannelHealthService);
  });

  const mockRequest = {
    merchant: { id: 'merch_123' },
  } as AuthenticatedRequest;

  const mockHealthDto: ChannelHealthDto = {
    channelId: 'ch_123',
    status: 'connected',
    webhookSubscribed: true,
    lastWebhookAt: '2026-01-01T00:00:00.000Z',
    recentErrors: [],
    errorCount: 0,
    lastErrorAt: null,
    recommendation: null,
  };

  describe('getHealth', () => {
    it('should call service.getHealth with correct params', async () => {
      jest.spyOn(service, 'getHealth').mockResolvedValue(mockHealthDto);

      const result = await controller.getHealth('ch_123', mockRequest);

      expect(service.getHealth).toHaveBeenCalledWith('ch_123', 'merch_123');
      expect(result).toEqual(mockHealthDto);
    });
  });

  describe('retryWebhook', () => {
    it('should call service.retryWebhookSubscription with correct params', async () => {
      const mockResponse = { success: true, message: 'Success' };
      jest.spyOn(service, 'retryWebhookSubscription').mockResolvedValue(mockResponse);

      const result = await controller.retryWebhook('ch_123', mockRequest);

      expect(service.retryWebhookSubscription).toHaveBeenCalledWith('ch_123', 'merch_123');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('refreshStatus', () => {
    it('should call service.refreshChannelStatus with correct params', async () => {
      const mockResponse = { success: true, status: 'connected' };
      jest.spyOn(service, 'refreshChannelStatus').mockResolvedValue(mockResponse);

      const result = await controller.refreshStatus('ch_123', mockRequest);

      expect(service.refreshChannelStatus).toHaveBeenCalledWith('ch_123', 'merch_123');
      expect(result).toEqual(mockResponse);
    });
  });
});
