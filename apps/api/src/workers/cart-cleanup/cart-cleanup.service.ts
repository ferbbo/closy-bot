import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CartService } from '../../services/cart.service';

/**
 * Cart Cleanup Service (PR-04 REQ-18)
 *
 * Periodically marks expired carts as abandoned.
 * Runs daily via cron to maintain data hygiene.
 *
 * Cleanup job: marks expired carts as abandoned (edge case per brief)
 */
@Injectable()
export class CartCleanupService {
  private readonly logger = new Logger(CartCleanupService.name);

  constructor(private readonly cartService: CartService) {}

  /**
   * Cron job: Mark expired carts as abandoned
   * Runs every day at 2:00 AM (low-traffic hours)
   * Cleanup job: runs daily at 3am to mark expired carts as abandoned
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredCarts() {
    this.logger.log('Starting cleanup of expired carts...');

    try {
      const markedCount = await this.cartService.markExpiredCartsAsAbandoned();
      this.logger.log(`Marked ${markedCount} expired carts as abandoned`);
    } catch (error) {
      this.logger.error('Cart cleanup failed', error instanceof Error ? error.stack : error);
    }
  }

  /**
   * Manual trigger for cleanup (useful for testing)
   */
  async triggerCleanup(): Promise<{ markedCount: number }> {
    this.logger.log('Manual cart cleanup triggered');
    const markedCount = await this.cartService.markExpiredCartsAsAbandoned();
    return { markedCount };
  }
}
