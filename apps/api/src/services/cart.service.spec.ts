import { Test, TestingModule } from '@nestjs/testing';
import { CartService } from './cart.service';
import { CartRepository } from '../persistence/repositories/cart.repository';
import { ProductRepository } from '../persistence/repositories/product.repository';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { Cart, CartItem, Product, ProductVariant } from '@prisma/client';

describe('CartService', () => {
  let service: CartService;
  let cartRepository: jest.Mocked<CartRepository>;
  let productRepository: jest.Mocked<ProductRepository>;

  const mockCustomerId = 'cust_123';
  const mockConversationId = 'conv_123';
  const mockProductId = 'prod_123';
  const mockVariantId = 'var_123';

  const mockVariant: ProductVariant = {
    id: mockVariantId,
    productId: mockProductId,
    sku: 'SKU001',
    name: 'Talla M',
    price: new Decimal(49.99),
    stock: 100,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockProduct: Product & { variants: ProductVariant[] } = {
    id: mockProductId,
    name: 'Camisa Azul',
    description: 'Camisa de algodón',
    categoryId: 'cat_123',
    merchantId: 'merch_123',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [mockVariant],
  };

  const mockCart: Cart & { items: CartItem[] } = {
    id: 'cart_123',
    customerId: mockCustomerId,
    conversationId: mockConversationId,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
  };

  const mockCartItem: CartItem = {
    id: 'item_123',
    cartId: 'cart_123',
    productId: mockProductId,
    productVariantId: mockVariantId,
    quantity: 2,
    unitPrice: new Decimal(49.99),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockCartRepo = {
      findByConversationId: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      addItem: jest.fn(),
      updateItemQuantity: jest.fn(),
      removeItem: jest.fn(),
      clearCart: jest.fn(),
    };

    const mockProductRepo = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: CartRepository,
          useValue: mockCartRepo,
        },
        {
          provide: ProductRepository,
          useValue: mockProductRepo,
        },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
    cartRepository = module.get(CartRepository);
    productRepository = module.get(ProductRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateCart', () => {
    it('should return existing cart if found', async () => {
      cartRepository.findByConversationId.mockResolvedValue(mockCart);

      const result = await service.getOrCreateCart(mockConversationId, mockCustomerId);

      expect(result).toEqual(mockCart);
      expect(cartRepository.findByConversationId).toHaveBeenCalledWith(mockConversationId);
      expect(cartRepository.create).not.toHaveBeenCalled();
    });

    it('should create new cart if not found', async () => {
      cartRepository.findByConversationId.mockResolvedValue(null);
      cartRepository.create.mockResolvedValue(mockCart);
      cartRepository.findById.mockResolvedValue(mockCart);

      const result = await service.getOrCreateCart(mockConversationId, mockCustomerId);

      expect(result).toEqual(mockCart);
      expect(cartRepository.create).toHaveBeenCalled();
    });

    it('should handle race condition when cart is created by concurrent request (P2002)', async () => {
      cartRepository.findByConversationId.mockResolvedValueOnce(null);
      const p2002Error = Object.assign(new Error('Unique constraint violation'), { code: 'P2002' });
      cartRepository.create.mockRejectedValueOnce(p2002Error);
      cartRepository.findByConversationId.mockResolvedValueOnce(mockCart);

      const result = await service.getOrCreateCart(mockConversationId, mockCustomerId);

      expect(result).toEqual(mockCart);
      expect(cartRepository.findByConversationId).toHaveBeenCalledTimes(2);
    });

    it('should throw error if cart still not found after P2002', async () => {
      cartRepository.findByConversationId.mockResolvedValueOnce(null);
      const p2002Error = Object.assign(new Error('Unique constraint violation'), { code: 'P2002' });
      cartRepository.create.mockRejectedValueOnce(p2002Error);
      cartRepository.findByConversationId.mockResolvedValueOnce(null);

      await expect(service.getOrCreateCart(mockConversationId, mockCustomerId)).rejects.toThrow();
    });

    it('should re-throw non-P2002 errors', async () => {
      cartRepository.findByConversationId.mockResolvedValueOnce(null);
      const otherError = Object.assign(new Error('Database connection failed'), { code: 'P1001' });
      cartRepository.create.mockRejectedValueOnce(otherError);

      await expect(service.getOrCreateCart(mockConversationId, mockCustomerId)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('addItem', () => {
    it('should add item to cart with valid product and variant', async () => {
      const cartWithItem = { ...mockCart, items: [mockCartItem] };
      cartRepository.findByConversationId.mockResolvedValue(mockCart);
      productRepository.findById.mockResolvedValue(mockProduct);
      cartRepository.addItem.mockResolvedValue(mockCartItem);
      cartRepository.findById.mockResolvedValue(cartWithItem);

      const result = await service.addItem({
        conversationId: mockConversationId,
        customerId: mockCustomerId,
        productId: mockProductId,
        variantId: mockVariantId,
        quantity: 2,
      });

      expect(result.items).toHaveLength(1);
      expect(cartRepository.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 2,
          unitPrice: mockVariant.price,
        }),
      );
    });

    it('should throw BadRequestException for quantity <= 0', async () => {
      await expect(
        service.addItem({
          conversationId: mockConversationId,
          customerId: mockCustomerId,
          productId: mockProductId,
          quantity: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent product', async () => {
      cartRepository.findByConversationId.mockResolvedValue(mockCart);
      productRepository.findById.mockResolvedValue(null);

      await expect(
        service.addItem({
          conversationId: mockConversationId,
          customerId: mockCustomerId,
          productId: 'invalid_product',
          quantity: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for inactive product', async () => {
      const inactiveProduct = { ...mockProduct, isActive: false };
      cartRepository.findByConversationId.mockResolvedValue(mockCart);
      productRepository.findById.mockResolvedValue(inactiveProduct);

      await expect(
        service.addItem({
          conversationId: mockConversationId,
          customerId: mockCustomerId,
          productId: mockProductId,
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for insufficient stock', async () => {
      const lowStockVariant = { ...mockVariant, stock: 1 };
      const productWithLowStock = { ...mockProduct, variants: [lowStockVariant] };
      cartRepository.findByConversationId.mockResolvedValue(mockCart);
      productRepository.findById.mockResolvedValue(productWithLowStock);

      await expect(
        service.addItem({
          conversationId: mockConversationId,
          customerId: mockCustomerId,
          productId: mockProductId,
          variantId: mockVariantId,
          quantity: 10, // More than available
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use first available variant if no variant specified', async () => {
      const cartWithItem = { ...mockCart, items: [mockCartItem] };
      cartRepository.findByConversationId.mockResolvedValue(mockCart);
      productRepository.findById.mockResolvedValue(mockProduct);
      cartRepository.addItem.mockResolvedValue(mockCartItem);
      cartRepository.findById.mockResolvedValue(cartWithItem);

      await service.addItem({
        conversationId: mockConversationId,
        customerId: mockCustomerId,
        productId: mockProductId,
        quantity: 1,
      });

      expect(cartRepository.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          unitPrice: mockVariant.price,
        }),
      );
    });

    it('should throw BadRequestException when adding more than stock considering items already in cart', async () => {
      const existingCartItem = { ...mockCartItem, quantity: 3 };
      const cartWithExistingItem = { ...mockCart, items: [existingCartItem] };
      const lowStockVariant = { ...mockVariant, stock: 5 }; // Only 5 in stock
      const productWithLowStock = { ...mockProduct, variants: [lowStockVariant] };

      cartRepository.findByConversationId.mockResolvedValue(cartWithExistingItem);
      productRepository.findById.mockResolvedValue(productWithLowStock);

      // Trying to add 3 more, but already have 3 in cart. Total would be 6, stock is 5
      await expect(
        service.addItem({
          conversationId: mockConversationId,
          customerId: mockCustomerId,
          productId: mockProductId,
          variantId: mockVariantId,
          quantity: 3,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow adding when total quantity (existing + new) does not exceed stock', async () => {
      const existingCartItem = { ...mockCartItem, quantity: 2 };
      const cartWithExistingItem = { ...mockCart, items: [existingCartItem] };
      const updatedCart = {
        ...mockCart,
        items: [{ ...existingCartItem, quantity: 5 }],
      };
      const variantWithStock = { ...mockVariant, stock: 10 };
      const productWithStock = { ...mockProduct, variants: [variantWithStock] };

      cartRepository.findByConversationId.mockResolvedValue(cartWithExistingItem);
      productRepository.findById.mockResolvedValue(productWithStock);
      cartRepository.addItem.mockResolvedValue({ ...existingCartItem, quantity: 5 });
      cartRepository.findById.mockResolvedValue(updatedCart);

      // Adding 3 more, already have 2, total 5. Stock is 10, should succeed
      const result = await service.addItem({
        conversationId: mockConversationId,
        customerId: mockCustomerId,
        productId: mockProductId,
        variantId: mockVariantId,
        quantity: 3,
      });

      expect(result).toEqual(updatedCart);
      expect(cartRepository.addItem).toHaveBeenCalled();
    });

    it('should handle null variant properly when checking existing items', async () => {
      const itemWithoutVariant = { ...mockCartItem, productVariantId: null, quantity: 2 };
      const cartWithItem = { ...mockCart, items: [itemWithoutVariant] };
      const variantWithStock = { ...mockVariant, stock: 10 };
      const productWithStock = { ...mockProduct, variants: [variantWithStock] };

      cartRepository.findByConversationId.mockResolvedValue(cartWithItem);
      productRepository.findById.mockResolvedValue(productWithStock);
      cartRepository.addItem.mockResolvedValue(itemWithoutVariant);
      cartRepository.findById.mockResolvedValue(cartWithItem);

      // Adding to same product without specifying variant (should match existing null variant item)
      await service.addItem({
        conversationId: mockConversationId,
        customerId: mockCustomerId,
        productId: mockProductId,
        // No variantId specified
        quantity: 3,
      });

      expect(cartRepository.addItem).toHaveBeenCalled();
    });
  });

  describe('updateItemQuantity', () => {
    it('should update item quantity', async () => {
      const cartWithItem = { ...mockCart, items: [mockCartItem] };
      const updatedCart = {
        ...mockCart,
        items: [{ ...mockCartItem, quantity: 5 }],
      };
      cartRepository.findByConversationId.mockResolvedValue(cartWithItem);
      productRepository.findById.mockResolvedValue(mockProduct);
      cartRepository.updateItemQuantity.mockResolvedValue({
        ...mockCartItem,
        quantity: 5,
      });
      cartRepository.findById.mockResolvedValue(updatedCart);

      const result = await service.updateItemQuantity(mockConversationId, 'item_123', 5);

      expect(result.items[0].quantity).toBe(5);
      expect(cartRepository.updateItemQuantity).toHaveBeenCalledWith('item_123', 5);
    });

    it('should throw BadRequestException for quantity <= 0', async () => {
      await expect(service.updateItemQuantity(mockConversationId, 'item_123', 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent cart', async () => {
      cartRepository.findByConversationId.mockResolvedValue(null);

      await expect(service.updateItemQuantity(mockConversationId, 'item_123', 5)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-existent item', async () => {
      cartRepository.findByConversationId.mockResolvedValue(mockCart);

      await expect(
        service.updateItemQuantity(mockConversationId, 'invalid_item', 5),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItem', () => {
    it('should remove item from cart', async () => {
      const cartWithItem = { ...mockCart, items: [mockCartItem] };
      cartRepository.findByConversationId.mockResolvedValue(cartWithItem);
      cartRepository.removeItem.mockResolvedValue(undefined);
      cartRepository.findById.mockResolvedValue(mockCart);

      const result = await service.removeItem(mockConversationId, 'item_123');

      expect(result.items).toHaveLength(0);
      expect(cartRepository.removeItem).toHaveBeenCalledWith('item_123');
    });

    it('should throw NotFoundException for non-existent cart', async () => {
      cartRepository.findByConversationId.mockResolvedValue(null);

      await expect(service.removeItem(mockConversationId, 'item_123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-existent item', async () => {
      cartRepository.findByConversationId.mockResolvedValue(mockCart);

      await expect(service.removeItem(mockConversationId, 'invalid_item')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCartSummary', () => {
    it('should return cart summary with items', async () => {
      const cartWithItems = { ...mockCart, items: [mockCartItem, mockCartItem] };
      cartRepository.findByConversationId.mockResolvedValue(cartWithItems);

      const result = await service.getCartSummary(mockConversationId);

      expect(result.itemCount).toBe(4); // 2 items * 2 qty each
      expect(result.subtotal).toBe(199.96); // 49.99 * 2 * 2
      expect(result.items).toHaveLength(2);
    });

    it('should return empty summary for empty cart', async () => {
      cartRepository.findByConversationId.mockResolvedValue(mockCart);

      const result = await service.getCartSummary(mockConversationId);

      expect(result.itemCount).toBe(0);
      expect(result.subtotal).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('should return empty summary when cart not found', async () => {
      cartRepository.findByConversationId.mockResolvedValue(null);

      const result = await service.getCartSummary(mockConversationId);

      expect(result.itemCount).toBe(0);
      expect(result.subtotal).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  describe('clearCart', () => {
    it('should clear cart items', async () => {
      cartRepository.findByConversationId.mockResolvedValue(mockCart);
      cartRepository.clearCart.mockResolvedValue(undefined);

      await service.clearCart(mockConversationId);

      expect(cartRepository.clearCart).toHaveBeenCalledWith(mockCart.id);
    });

    it('should throw NotFoundException for non-existent cart', async () => {
      cartRepository.findByConversationId.mockResolvedValue(null);

      await expect(service.clearCart(mockConversationId)).rejects.toThrow(NotFoundException);
    });
  });
});
