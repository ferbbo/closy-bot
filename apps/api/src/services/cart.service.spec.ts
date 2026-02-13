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
