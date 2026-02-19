import { Test, TestingModule } from '@nestjs/testing';
import { ChannelListService } from './channel-list.service';
import { ChannelRepository } from '../persistence/repositories/channel.repository';
import { Channel, ChannelType, ChannelStatus } from '@prisma/client';

/**
 * Unit tests for ChannelListService
 * PR-16: REQ-03 (AC-04)
 */
describe('AC-04: ChannelListService maps to safe DTO', () => {
  let service: ChannelListService;
  let repository: jest.Mocked<ChannelRepository>;

  beforeEach(async () => {
    const mockRepository = {
      findByMerchantId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelListService,
        {
          provide: ChannelRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ChannelListService>(ChannelListService);
    repository = module.get(ChannelRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should map channels to DTO without credentials', async () => {
    const merchantId = 'merchant_123';
    const mockChannels: Partial<Channel>[] = [
      {
        id: 'ch_abc',
        type: ChannelType.WHATSAPP,
        displayName: 'Sucursal Centro',
        status: ChannelStatus.connected,
        webhookSubscribed: true,
        lastWebhookAt: new Date('2026-02-19T10:00:00Z'),
        createdAt: new Date('2026-02-15T08:00:00Z'),
        credentials: { accessToken: 'secret_token', appSecret: 'app_secret' }, // Should NOT be in DTO
        merchantId: 'merchant_123',
        externalId: 'phone_123',
        isActive: true,
      },
    ];

    repository.findByMerchantId.mockResolvedValue(mockChannels as Channel[]);

    const result = await service.getChannels(merchantId);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'ch_abc',
      type: ChannelType.WHATSAPP,
      displayName: 'Sucursal Centro',
      status: ChannelStatus.connected,
      webhookSubscribed: true,
      lastWebhookAt: new Date('2026-02-19T10:00:00Z'),
      createdAt: new Date('2026-02-15T08:00:00Z'),
    });
    expect(result[0]).not.toHaveProperty('credentials');
    expect(result[0]).not.toHaveProperty('accessToken');
    expect(result[0]).not.toHaveProperty('merchantId');
    expect(result[0]).not.toHaveProperty('externalId');
  });

  it('should return empty array when merchant has no channels', async () => {
    const merchantId = 'merchant_no_channels';

    repository.findByMerchantId.mockResolvedValue([]);

    const result = await service.getChannels(merchantId);

    expect(result).toEqual([]);
    expect(repository.findByMerchantId).toHaveBeenCalledWith(merchantId);
  });

  it('should handle channels with null lastWebhookAt', async () => {
    const merchantId = 'merchant_123';
    const mockChannels: Partial<Channel>[] = [
      {
        id: 'ch_def',
        type: ChannelType.WHATSAPP,
        displayName: 'Sucursal Norte',
        status: ChannelStatus.error,
        webhookSubscribed: false,
        lastWebhookAt: null,
        createdAt: new Date('2026-02-18T14:00:00Z'),
        credentials: { accessToken: 'secret', appSecret: 'secret' },
        merchantId: 'merchant_123',
        externalId: 'phone_456',
        isActive: true,
      },
    ];

    repository.findByMerchantId.mockResolvedValue(mockChannels as Channel[]);

    const result = await service.getChannels(merchantId);

    expect(result).toHaveLength(1);
    expect(result[0].lastWebhookAt).toBeNull();
  });

  it('should map multiple channels maintaining order from repository', async () => {
    const merchantId = 'merchant_multi';
    const mockChannels: Partial<Channel>[] = [
      {
        id: 'ch_1',
        type: ChannelType.WHATSAPP,
        displayName: 'Channel 1',
        status: ChannelStatus.connected,
        webhookSubscribed: true,
        lastWebhookAt: new Date('2026-02-19T10:00:00Z'),
        createdAt: new Date('2026-02-19T08:00:00Z'),
        credentials: {},
        merchantId,
        externalId: 'phone_1',
        isActive: true,
      },
      {
        id: 'ch_2',
        type: ChannelType.WHATSAPP,
        displayName: 'Channel 2',
        status: ChannelStatus.pending,
        webhookSubscribed: false,
        lastWebhookAt: null,
        createdAt: new Date('2026-02-18T08:00:00Z'),
        credentials: {},
        merchantId,
        externalId: 'phone_2',
        isActive: true,
      },
    ];

    repository.findByMerchantId.mockResolvedValue(mockChannels as Channel[]);

    const result = await service.getChannels(merchantId);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('ch_1');
    expect(result[1].id).toBe('ch_2');
  });
});
