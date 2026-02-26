import { Module } from '@nestjs/common';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaOAuthService } from './meta-oauth.service';
import { MetaEmbeddedSignupProvider } from './providers/meta-embedded-signup.provider';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthModule } from '../auth/auth.module'; // For SessionAuthGuard
import { ServicesModule } from '../services/services.module'; // PR-OB-01: PlaybookService
import { MerchantSettingsModule } from '../merchant-settings/merchant-settings.module'; // PR-OB-01: MerchantConfigService
import { OnboardingController } from './onboarding.controller'; // PR-OB-01
import { OnboardingService } from './onboarding.service'; // PR-OB-01
import { FeatureFlagsModule } from '../common/feature-flags/feature-flags.module'; // PR-MVP-01

/**
 * Onboarding module for merchant channel setup
 * Handles Meta Embedded Signup OAuth flow for WhatsApp
 * PR-OB-01: Onboarding Wizard API (progress, preset, activate)
 *
 * PR-13: Meta Embedded Signup
 */
@Module({
  imports: [
    PersistenceModule, // For Prisma
    AuthModule, // For SessionAuthGuard
    ServicesModule, // PR-OB-01: PlaybookService
    MerchantSettingsModule, // PR-OB-01: MerchantConfigService
    FeatureFlagsModule, // PR-MVP-01: Feature flags for channel gating
  ],
  controllers: [MetaOAuthController, OnboardingController], // PR-OB-01: add OnboardingController
  providers: [
    MetaOAuthService,
    OnboardingService, // PR-OB-01
    {
      provide: MetaEmbeddedSignupProvider,
      useFactory: () => {
        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        const configId = process.env.META_CONFIG_ID;

        if (!appId || !appSecret || !configId) {
          throw new Error(
            'Missing required Meta credentials: META_APP_ID, META_APP_SECRET, META_CONFIG_ID',
          );
        }

        return new MetaEmbeddedSignupProvider(appId, appSecret, configId);
      },
    },
  ],
  exports: [MetaOAuthService, MetaEmbeddedSignupProvider, OnboardingService], // PR-OB-01: Export OnboardingService
})
export class OnboardingModule {}
