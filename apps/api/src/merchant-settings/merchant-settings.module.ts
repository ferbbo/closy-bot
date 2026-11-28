import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthModule } from '../auth/auth.module';
import { ServicesModule } from '../services/services.module';
import { FeatureFlagsModule } from '../common/feature-flags/feature-flags.module';
import { MerchantSettingsController } from './merchant-settings.controller';
import { MerchantSettingsService } from './merchant-settings.service';
import { MerchantConfigService } from './merchant-config.service';

@Module({
  imports: [PersistenceModule, AuthModule, ServicesModule, FeatureFlagsModule],
  controllers: [MerchantSettingsController],
  providers: [MerchantSettingsService, MerchantConfigService],
  exports: [MerchantSettingsService, MerchantConfigService],
})
export class MerchantSettingsModule {}
