import { Test, TestingModule } from '@nestjs/testing';
import { ChannelRepository } from './channel.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelType } from '@prisma/client';

describe('ChannelRepository (AC-02)', () => {
  let repository: ChannelRepository;
  let prisma: PrismaService;

  const mockPrismaService = {
    channel: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<ChannelRepository>(ChannelRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByTypeAndExternalId', () => {
    it('should find channel by type and externalId', async () => {
      const mockChannel = {
        id: 'channel-1',
        merchantId: 'merchant-1',
        type: ChannelType.WHATSAPP,
        externalId: 'phone-123',
        displayName: 'WhatsApp Principal',
        credentials: { accessToken: 'token-123', appSecret: 'secret-123' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        merchant: {
          id: 'merchant-1',
          name: 'Test Merchant',
          whatsappNumber: '+573001234567',
          apiKey: 'api-key-1',
          industry: null,
          playbookConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockPrismaService.channel.findUnique.mockResolvedValue(mockChannel);

      const result = await repository.findByTypeAndExternalId(ChannelType.WHATSAPP, 'phone-123');

      expect(result).toEqual(mockChannel);
      expect(prisma.channel.findUnique).toHaveBeenCalledWith({
        where: {
          type_externalId: {
            type: ChannelType.WHATSAPP,
            externalId: 'phone-123',
          },
        },
        include: {
          merchant: true,
        },
      });
    });

    it('should return null when channel not found', async () => {
      mockPrismaService.channel.findUnique.mockResolvedValue(null);

      const result = await repository.findByTypeAndExternalId(
        ChannelType.WHATSAPP,
        'unknown-phone',
      );

      expect(result).toBeNull();
    });
  });

  describe('findByMerchantId', () => {
    it('should return all active channels for merchant', async () => {
      const mockChannels = [
        {
          id: 'channel-1',
          merchantId: 'merchant-1',
          type: ChannelType.WHATSAPP,
          externalId: 'phone-123',
          displayName: 'WhatsApp 1',
          credentials: {},
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'channel-2',
          merchantId: 'merchant-1',
          type: ChannelType.WHATSAPP,
          externalId: 'phone-456',
          displayName: 'WhatsApp 2',
          credentials: {},
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.channel.findMany.mockResolvedValue(mockChannels);

      const result = await repository.findByMerchantId('merchant-1');

      expect(result).toEqual(mockChannels);
      expect(result).toHaveLength(2);
      expect(prisma.channel.findMany).toHaveBeenCalledWith({
        where: {
          merchantId: 'merchant-1',
          isActive: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });

    it('should return empty array when merchant has no channels', async () => {
      mockPrismaService.channel.findMany.mockResolvedValue([]);

      const result = await repository.findByMerchantId('merchant-without-channels');

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should find channel by id', async () => {
      const mockChannel = {
        id: 'channel-1',
        merchantId: 'merchant-1',
        type: ChannelType.WHATSAPP,
        externalId: 'phone-123',
        displayName: 'WhatsApp Principal',
        credentials: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        merchant: {
          id: 'merchant-1',
          name: 'Test Merchant',
        },
      };

      mockPrismaService.channel.findUnique.mockResolvedValue(mockChannel);

      const result = await repository.findById('channel-1');

      expect(result).toEqual(mockChannel);
      expect(prisma.channel.findUnique).toHaveBeenCalledWith({
        where: { id: 'channel-1' },
        include: {
          merchant: true,
        },
      });
    });

    it('should return null when channel not found', async () => {
      mockPrismaService.channel.findUnique.mockResolvedValue(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });
});
