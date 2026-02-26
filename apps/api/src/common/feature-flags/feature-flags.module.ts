import { Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';

/**
 * FeatureFlagsModule — Global module for MVP/B2 feature separation
 *
 * Import this module in AppModule to make FeatureFlagsService available globally.
 * REQ-01: Expose FeatureFlagsService for injection across all modules
 */
@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
