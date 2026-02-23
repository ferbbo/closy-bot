import { Test, TestingModule } from '@nestjs/testing';
import { CartCleanupService } from './cart-cleanup.service';
import { CartService } from '../../services/cart.service';

/**
 * CartCleanupService Unit Tests
 * PR-04 AC-19: Cleanup job
 */
describe('CartCleanupService', () => {
  let service: CartCleanupService;
  let cartService: jest.Mocked<CartService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartCleanupService,
        {
          provide: CartService,
          useValue: {
            markExpiredCartsAsAbandoned: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CartCleanupService>(CartCleanupService);
    cartService = module.get(CartService);
  });

  describe('AC-19: cleanupExpiredCarts', () => {
    it('should mark expired carts', async () => {
      cartService.markExpiredCartsAsAbandoned.mockResolvedValue(3);

      await service.cleanupExpiredCarts();

      expect(cartService.markExpiredCartsAsAbandoned).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      cartService.markExpiredCartsAsAbandoned.mockRejectedValue(new Error('DB error'));

      await expect(service.cleanupExpiredCarts()).resolves.not.toThrow();
    });
  });

  describe('Manual cleanup trigger', () => {
    it('should trigger cleanup manually', async () => {
      cartService.markExpiredCartsAsAbandoned.mockResolvedValue(5);

      const result = await service.triggerCleanup();

      expect(result.markedCount).toBe(5);
      expect(cartService.markExpiredCartsAsAbandoned).toHaveBeenCalled();
    });
  });
});
