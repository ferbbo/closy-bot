import { Module } from '@nestjs/common';
import { CartCleanupService } from './cart-cleanup.service';
import { ServicesModule } from '../../services/services.module';

/**
 * Cart Cleanup Module
 * Provides scheduled task for marking expired carts as abandoned
 * PR-04: Cart cleanup job
 */
@Module({
  imports: [ServicesModule],
  providers: [CartCleanupService],
  exports: [CartCleanupService],
})
export class CartCleanupModule {}
