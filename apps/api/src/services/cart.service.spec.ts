import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartRepository } from '../persistence/repositories/cart.repository';
import { CartItemRepository } from '../persistence/repositories/cart-item.repository';
import { ProductRepository } from '../persistence/repositories/product.repository';
import { MerchantResolverService } from './merchant-resolver.service';
import { CartStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * CartService Unit Tests
 * PR-04: Tests for cart CRUD operations with guardrails
 */
describe('CartService', () => {
  let service: CartService;
  let cartRepository: jest.Mocked<CartRepository>;
  let cartItemRepository: jest.Mocked<CartItemRepository>;
  let productRepository: jest.Mocked<ProductRepository>;
  let merchantResolverService: jest.Mocked<MerchantResolverService>;

  const mockCart = {
    id: 'cart-1',
    customerId: 'customer-1',
    merchantId: 'merchant-1',
    status: CartStatus.active,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVariant = {
    id: 'variant-1',
    productId: 'product-1',
    sku: 'SKU-001',
    name: 'Talla M',
    price: new Decimal(25),
    stock: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockProduct = {
    id: 'product-1',
    name: 'Camiseta Roja',
    description: 'Descripción',
    categoryId: 'category-1',
    merchantId: 'merchant-1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [mockVariant],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: CartRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn().mockResolvedValue(mockCart), // AC-13: For refreshCartTTL helper
            findByIdWithItems: jest.fn(),
            findActiveCart: jest.fn(),
            updateStatus: jest.fn(),
            refreshTTL: jest.fn().mockResolvedValue(mockCart),
            findExpiredCarts: jest.fn(),
          },
        },
        {
          provide: CartItemRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findByCartAndVariant: jest.fn(),
            updateQuantity: jest.fn(),
            delete: jest.fn(),
            deleteByCartId: jest.fn(),
          },
        },
        {
          provide: ProductRepository,
          useValue: {
            findByVariantId: jest.fn(),
          },
        },
        {
          provide: MerchantResolverService,
          useValue: {
            getById: jest.fn().mockResolvedValue({
              id: 'merchant-1',
              playbookConfig: {
                cartConfig: {
                  ttlHours: 24,
                },
              },
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(24), // CART_TTL_HOURS = 24
          },
        },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
    cartRepository = module.get(CartRepository);
    cartItemRepository = module.get(CartItemRepository);
    productRepository = module.get(ProductRepository);
    merchantResolverService = module.get(MerchantResolverService);
  });

  describe('AC-03: createOrGetActiveCart', () => {
    it('should reuse active cart', async () => {
      cartRepository.findActiveCart.mockResolvedValue(mockCart);
      cartRepository.findByIdWithItems.mockResolvedValue({
        ...mockCart,
        items: [],
      });

      const result = await service.createOrGetActiveCart('customer-1', 'merchant-1');

      expect(result.id).toBe('cart-1');
      expect(cartRepository.findActiveCart).toHaveBeenCalledWith('customer-1', 'merchant-1');
      expect(cartRepository.create).not.toHaveBeenCalled();
    });

    it('AC-13: should set expiration on create', async () => {
      cartRepository.findActiveCart.mockResolvedValue(null);
      cartRepository.create.mockResolvedValue(mockCart);
      cartRepository.findByIdWithItems.mockResolvedValue({
        ...mockCart,
        items: [],
      });

      await service.createOrGetActiveCart('customer-1', 'merchant-1');

      expect(cartRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: { connect: { id: 'customer-1' } },
          merchant: { connect: { id: 'merchant-1' } },
          status: CartStatus.active,
          expiresAt: expect.any(Date),
        }),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createCall = cartRepository.create.mock.calls[0][0] as any;
      const expiresAt = createCall.expiresAt;
      const now = new Date();
      const diff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diff).toBeGreaterThan(23); // ~24 hours
      expect(diff).toBeLessThan(25);
    });
  });

  describe('AC-04, AC-05: addItem with price snapshot and stock validation', () => {
    it('AC-04: should snapshot price at add time', async () => {
      productRepository.findByVariantId.mockResolvedValue(mockProduct);
      cartItemRepository.findByCartAndVariant.mockResolvedValue(null);
      cartItemRepository.create.mockResolvedValue({
        id: 'item-1',
        cartId: 'cart-1',
        variantId: 'variant-1',
        quantity: 1,
        priceSnapshot: new Decimal(25),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // AC-04: Mock cart creation/retrieval
      cartRepository.findActiveCart.mockResolvedValue(null); // No existing cart
      cartRepository.create.mockResolvedValue(mockCart);
      cartRepository.findByIdWithItems.mockResolvedValue({
        ...mockCart,
        items: [],
      });
      merchantResolverService.getById.mockResolvedValue({
        id: 'merchant-1',
        name: 'Test Merchant',
        whatsappNumber: '+test',
        apiKey: 'test',
        industry: null,
        playbookConfig: { cartConfig: { ttlHours: 24 } },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.addItem('customer-1', 'merchant-1', 'variant-1', 1);

      expect(cartItemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priceSnapshot: new Decimal(25),
        }),
      );
    });

    it('AC-06: should validate stock', async () => {
      productRepository.findByVariantId.mockResolvedValue({
        ...mockProduct,
        variants: [{ ...mockVariant, stock: 2 }],
      });
      // AC-04: Mock cart creation/retrieval
      cartRepository.findActiveCart.mockResolvedValue(null); // No existing cart
      cartRepository.create.mockResolvedValue(mockCart);
      cartRepository.findByIdWithItems.mockResolvedValue({ ...mockCart, items: [] });
      merchantResolverService.getById.mockResolvedValue({
        id: 'merchant-1',
        name: 'Test Merchant',
        whatsappNumber: '+test',
        apiKey: 'test',
        industry: null,
        playbookConfig: { cartConfig: { ttlHours: 24 } },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.addItem('customer-1', 'merchant-1', 'variant-1', 5)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.addItem('customer-1', 'merchant-1', 'variant-1', 5)).rejects.toThrow(
        'Stock insuficiente',
      );
    });
  });

  describe('AC-06: updateQuantity', () => {
    it('should update quantity', async () => {
      const mockItem = {
        id: 'item-1',
        cartId: 'cart-1',
        variantId: 'variant-1',
        quantity: 1,
        priceSnapshot: new Decimal(25),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      cartItemRepository.findById.mockResolvedValue(mockItem);
      productRepository.findByVariantId.mockResolvedValue(mockProduct);
      cartItemRepository.updateQuantity.mockResolvedValue({ ...mockItem, quantity: 3 });
      cartRepository.findByIdWithItems.mockResolvedValue({
        ...mockCart,
        items: [],
      });

      await service.updateQuantity('cart-1', 'item-1', 3);

      expect(cartItemRepository.updateQuantity).toHaveBeenCalledWith('item-1', 3);
    });

    it('should remove item when quantity is 0', async () => {
      cartItemRepository.findById.mockResolvedValue({
        id: 'item-1',
        cartId: 'cart-1',
        variantId: 'variant-1',
        quantity: 1,
        priceSnapshot: new Decimal(25),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      cartRepository.findByIdWithItems.mockResolvedValue({
        ...mockCart,
        items: [],
      });

      await service.updateQuantity('cart-1', 'item-1', 0);

      expect(cartItemRepository.delete).toHaveBeenCalledWith('item-1');
    });
  });

  describe('AC-07: removeItem', () => {
    it('should remove item', async () => {
      cartItemRepository.findById.mockResolvedValue({
        id: 'item-1',
        cartId: 'cart-1',
        variantId: 'variant-1',
        quantity: 1,
        priceSnapshot: new Decimal(25),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      cartRepository.findByIdWithItems.mockResolvedValue({
        ...mockCart,
        items: [],
      });

      await service.removeItem('cart-1', 'item-1');

      expect(cartItemRepository.delete).toHaveBeenCalledWith('item-1');
    });
  });

  describe('AC-08: getCartSummary', () => {
    it('should calculate totals', async () => {
      cartRepository.findByIdWithItems.mockResolvedValue({
        ...mockCart,
        items: [
          {
            id: 'item-1',
            cartId: 'cart-1',
            variantId: 'variant-1',
            quantity: 2,
            priceSnapshot: new Decimal(25),
            createdAt: new Date(),
            updatedAt: new Date(),
            variant: {
              id: 'variant-1',
              name: 'Talla M',
              price: new Decimal(25),
              productId: 'product-1',
              product: {
                id: 'product-1',
                name: 'Camiseta Roja',
              },
            },
          },
          {
            id: 'item-2',
            cartId: 'cart-1',
            variantId: 'variant-2',
            quantity: 1,
            priceSnapshot: new Decimal(30),
            createdAt: new Date(),
            updatedAt: new Date(),
            variant: {
              id: 'variant-2',
              name: 'Talla L',
              price: new Decimal(30),
              productId: 'product-1',
              product: {
                id: 'product-1',
                name: 'Camiseta Roja',
              },
            },
          },
        ],
      });

      const summary = await service.getCartSummary('cart-1');

      expect(summary.items).toHaveLength(2);
      expect(summary.items[0].subtotal).toBe(50); // 2 * 25
      expect(summary.items[1].subtotal).toBe(30); // 1 * 30
      expect(summary.total).toBe(80); // 50 + 30
      expect(summary.itemCount).toBe(3); // 2 + 1
    });
  });

  describe('Cleanup: markExpiredCartsAsAbandoned', () => {
    it('should mark expired carts as abandoned', async () => {
      const expiredCart1 = { ...mockCart, id: 'cart-expired-1' };
      const expiredCart2 = { ...mockCart, id: 'cart-expired-2' };

      cartRepository.findExpiredCarts.mockResolvedValue([expiredCart1, expiredCart2]);

      const count = await service.markExpiredCartsAsAbandoned();

      expect(count).toBe(2);
      expect(cartRepository.updateStatus).toHaveBeenCalledWith(
        'cart-expired-1',
        CartStatus.abandoned,
      );
      expect(cartRepository.updateStatus).toHaveBeenCalledWith(
        'cart-expired-2',
        CartStatus.abandoned,
      );
    });
  });
});
