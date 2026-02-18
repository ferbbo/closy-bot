import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MerchantResolverService } from './merchant-resolver.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { ChannelRepository } from '../persistence/repositories/channel.repository';
import { Channel, ChannelType, Merchant } from '@prisma/client';

describe('MerchantResolverService (PR-03.11)', () => {
  let service: MerchantResolverService;
  let prisma: jest.Mocked<PrismaService>;
  let channelRepo: jest.Mocked<ChannelRepository>;

  const mockMerchant: Merchant = {
    id: 'merchant-123',
    name: 'Test Store',
    whatsappNumber: '+573001111111',
    apiKey: 'sk_test_merchant_001',
    industry: null,
    playbookConfig: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockChannel: Channel = {
    id: 'channel-1',
    merchantId: 'merchant-123',
    type: ChannelType.WHATSAPP,
    externalId: 'phone-123',
    displayName: 'WhatsApp Principal',
    credentials: { accessToken: 'token-123', appSecret: 'secret-123' },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      merchant: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const mockChannelRepository = {
      findByTypeAndExternalId: jest.fn(),
      findByMerchantId: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantResolverService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ChannelRepository,
          useValue: mockChannelRepository,
        },
      ],
    }).compile();

    service = module.get<MerchantResolverService>(MerchantResolverService);
    prisma = module.get(PrismaService);
    channelRepo = module.get(ChannelRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveByChannel() - AC-03', () => {
    it('should resolve merchant and channel by type and externalId', async () => {
      channelRepo.findByTypeAndExternalId.mockResolvedValue(mockChannel);
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      const result = await service.resolveByChannel(ChannelType.WHATSAPP, 'phone-123');

      expect(result).toEqual({
        merchant: mockMerchant,
        channel: mockChannel,
      });
      expect(channelRepo.findByTypeAndExternalId).toHaveBeenCalledWith(
        ChannelType.WHATSAPP,
        'phone-123',
      );
      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: 'merchant-123' },
      });
    });

    it('should return null when channel not found (unknown channel - AC-08)', async () => {
      channelRepo.findByTypeAndExternalId.mockResolvedValue(null);

      const result = await service.resolveByChannel(ChannelType.WHATSAPP, 'unknown-phone');

      expect(result).toBeNull();
      expect(channelRepo.findByTypeAndExternalId).toHaveBeenCalledWith(
        ChannelType.WHATSAPP,
        'unknown-phone',
      );
      expect(prisma.merchant.findUnique).not.toHaveBeenCalled();
    });

    it('should return null when merchant not found (defensive check)', async () => {
      channelRepo.findByTypeAndExternalId.mockResolvedValue(mockChannel);
      prisma.merchant.findUnique.mockResolvedValue(null);

      const result = await service.resolveByChannel(ChannelType.WHATSAPP, 'phone-123');

      expect(result).toBeNull();
    });
  });

  describe('resolveByWhatsAppPhoneId() - legacy method', () => {
    it('should resolve merchant by phone ID using resolveByChannel', async () => {
      channelRepo.findByTypeAndExternalId.mockResolvedValue(mockChannel);
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      const result = await service.resolveByWhatsAppPhoneId('phone-123');

      expect(result).toEqual(mockMerchant);
      expect(channelRepo.findByTypeAndExternalId).toHaveBeenCalledWith(
        ChannelType.WHATSAPP,
        'phone-123',
      );
    });

    it('should throw NotFoundException when channel not found', async () => {
      channelRepo.findByTypeAndExternalId.mockResolvedValue(null);

      await expect(service.resolveByWhatsAppPhoneId('unknown-phone')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.resolveByWhatsAppPhoneId('unknown-phone')).rejects.toThrow(
        'No merchant configured for this channel',
      );
    });
  });

  describe('getById()', () => {
    it('should return merchant by ID', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      const result = await service.getById('merchant-123');

      expect(result).toEqual(mockMerchant);
      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: 'merchant-123' },
      });
    });

    it('should throw NotFoundException when merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.getById('non-existent')).rejects.toThrow(NotFoundException);
      await expect(service.getById('non-existent')).rejects.toThrow(
        'Merchant not found: non-existent',
      );
    });
  });
});
