import { Test, TestingModule } from '@nestjs/testing';
import { PostgresSessionStore } from './postgres-session.store';
import { PrismaService } from '../../persistence/prisma/prisma.service';

describe('PostgresSessionStore (AC-06)', () => {
  let store: PostgresSessionStore;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresSessionStore,
        {
          provide: PrismaService,
          useValue: {
            session: {
              create: jest.fn(),
              findUnique: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    store = module.get<PostgresSessionStore>(PostgresSessionStore);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('AC-06: create', () => {
    it('should persist session in Postgres and return session ID', async () => {
      const mockSession = {
        id: 'cuid123',
        sessionId: 'uuid-123',
        merchantId: 'merchant-1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
        createdAt: new Date(),
      };

      jest.spyOn(prismaService.session, 'create').mockResolvedValue(mockSession);

      const result = await store.create('merchant-1', 24, {
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
      });

      expect(result.sessionId).toBeDefined();
      expect(result.merchantId).toBe('merchant-1');
      expect(prismaService.session.create).toHaveBeenCalled();
    });
  });

  describe('AC-07: validate with expiry check', () => {
    it('should return null if session expired', async () => {
      const expiredSession = {
        id: 'cuid123',
        sessionId: 'uuid-expired',
        merchantId: 'merchant-1',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
      };

      jest.spyOn(prismaService.session, 'findUnique').mockResolvedValue(expiredSession);

      const result = await store.findBySessionId('uuid-expired');

      expect(result).toBeNull();
    });

    it('should return session if not expired', async () => {
      const validSession = {
        id: 'cuid123',
        sessionId: 'uuid-valid',
        merchantId: 'merchant-1',
        expiresAt: new Date(Date.now() + 10000), // Expires in 10 seconds
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
      };

      jest.spyOn(prismaService.session, 'findUnique').mockResolvedValue(validSession);

      const result = await store.findBySessionId('uuid-valid');

      expect(result).toBeDefined();
      expect(result?.sessionId).toBe('uuid-valid');
    });
  });
});
