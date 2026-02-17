import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { envValidationSchema } from './config/env.validation';
import { MemoryConfigService } from './config/memory-config.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: true,
      },
    }),
    HealthModule,
  ],
  providers: [MemoryConfigService],
  exports: [ConfigModule, MemoryConfigService],
})
export class CommonModule {}
