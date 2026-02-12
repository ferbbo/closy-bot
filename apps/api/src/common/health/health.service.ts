import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import { HealthResponseDto, DbHealthResponseDto } from '../dto/health.dto';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  check(): HealthResponseDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async checkDb(): Promise<DbHealthResponseDto> {
    const startTime = Date.now();

    try {
      // Simple query to check DB connection
      await this.prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - startTime;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.warn(
        `DB health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        latency,
      };
    }
  }
}
