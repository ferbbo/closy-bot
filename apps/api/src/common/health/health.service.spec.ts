import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../../persistence/prisma/prisma.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('check', () => {
    it('should return ok status with timestamp', () => {
      const result = service.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
    });
  });

  describe('checkDb', () => {
    it('should return ok status and latency when DB is available', async () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.checkDb();

      expect(result.status).toBe('ok');
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(typeof result.latency).toBe('number');
    });

    it('should return error status when DB is unavailable', async () => {
      jest.spyOn(prismaService, '$queryRaw').mockRejectedValue(new Error('Connection failed'));

      const result = await service.checkDb();

      expect(result.status).toBe('error');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });
  });
});
