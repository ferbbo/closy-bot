import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../../persistence/prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
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

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return health status', () => {
      const result = controller.check();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });
  });

  describe('checkDb', () => {
    it('should return database health status', async () => {
      jest.spyOn(healthService, 'checkDb').mockResolvedValue({
        status: 'ok',
        timestamp: new Date().toISOString(),
        latency: 10,
      });

      const result = await controller.checkDb();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('latency');
      expect(typeof result.latency).toBe('number');
    });
  });
});
