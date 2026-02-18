import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SessionService } from './session.service';
import { SessionStore } from './session-store.interface';
import { PrismaService } from '../../persistence/prisma/prisma.service';

describe('SessionService (AC-07)', () => {
  let service: SessionService;
  let sessionStore: SessionStore;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const mockSessionStore = {
      create: jest.fn(),
      findBySessionId: jest.fn(),
      deleteBySessionId: jest.fn(),
      deleteExpired: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: 'SessionStore',
          useValue: mockSessionStore,
        },
        {
          provide: PrismaService,
          useValue: {
            merchant: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => 24),
          },
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    sessionStore = mockSessionStore;
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('AC-07: validate returns merchant if valid, null if expired', () => {
    it('should return merchant if session valid', async () => {
      const mockSession = {
        id: 'cuid123',
        sessionId: 'uuid-valid',
        merchantId: 'merchant-1',
        expiresAt: new Date(Date.now() + 10000),
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
      };

      const mockMerchant = {
        id: 'merchant-1',
        name: 'Test Merchant',
        whatsappNumber: 'test@example.com',
        apiKey: 'key123',
        industry: null,
        playbookConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(sessionStore, 'findBySessionId').mockResolvedValue(mockSession);
      jest.spyOn(prismaService.merchant, 'findUnique').mockResolvedValue(mockMerchant);

      const result = await service.validate('uuid-valid');

      expect(result).toBeDefined();
      expect(result?.id).toBe('merchant-1');
    });

    it('should return null if session not found or expired', async () => {
      jest.spyOn(sessionStore, 'findBySessionId').mockResolvedValue(null);

      const result = await service.validate('uuid-invalid');

      expect(result).toBeNull();
    });
  });
});
