import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthResponseDto, DbHealthResponseDto } from '../dto/health.dto';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthResponseDto {
    return this.healthService.check();
  }

  @Get('db')
  async checkDb(): Promise<DbHealthResponseDto> {
    return this.healthService.checkDb();
  }
}
