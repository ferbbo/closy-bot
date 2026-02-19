import { Module } from '@nestjs/common';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaOAuthService } from './meta-oauth.service';
import { MetaEmbeddedSignupProvider } from './providers/meta-embedded-signup.provider';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthModule } from '../auth/auth.module'; // For SessionAuthGuard

/**
 * Onboarding module for merchant channel setup
 * Handles Meta Embedded Signup OAuth flow for WhatsApp
 *
 * PR-13: Meta Embedded Signup
 */
@Module({
  imports: [
    PersistenceModule, // For Prisma
    AuthModule, // For SessionAuthGuard
  ],
  controllers: [MetaOAuthController],
  providers: [
    MetaOAuthService,
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
  exports: [MetaOAuthService, MetaEmbeddedSignupProvider], // PR-14: Export provider for ChannelHealthService
})
export class OnboardingModule {}
