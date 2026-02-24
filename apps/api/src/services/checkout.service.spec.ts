/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PR-05: CheckoutService unit tests
 * AC-03: orderCode generation sequential per merchant
 * AC-04: reject checkout if cart empty
 * AC-05: persist checkout state in conversation metadata
 * AC-09: snapshot price + name from CartItem
 * AC-10: Cart.status = completed after order creation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { CartRepository } from '../persistence/repositories/cart.repository';
import { OrderRepository } from '../persistence/repositories/order.repository';
import { ConversationRepository } from '../persistence/repositories/conversation.repository';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { CartStatus } from '@prisma/client';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let cartRepository: jest.Mocked<CartRepository>;
  let orderRepository: jest.Mocked<OrderRepository>;
  let conversationRepository: jest.Mocked<ConversationRepository>;
  let prismaService: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        {
          provide: CartRepository,
          useValue: {
            findActiveCart: jest.fn(),
            findByIdWithItems: jest.fn(),
          },
        },
        {
          provide: OrderRepository,
          useValue: {
            countByMerchant: jest.fn(),
            findByOrderCode: jest.fn(),
          },
        },
        {
          provide: ConversationRepository,
          useValue: {
            findById: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            cartItem: { count: jest.fn() },
            merchantConfig: { findUnique: jest.fn() },
            order: { create: jest.fn() },
            cart: { update: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
    cartRepository = module.get(CartRepository);
    orderRepository = module.get(OrderRepository);
    conversationRepository = module.get(ConversationRepository);
    prismaService = module.get(PrismaService);
  });

  // ---------------------------------------------------------------------------
  // AC-04 / AC-13 / REQ-12: reject checkout if cart is empty
  // ---------------------------------------------------------------------------

  describe('AC-04: startCheckout', () => {
    it('should reject checkout if no cart exists', async () => {
      cartRepository.findActiveCart.mockResolvedValue(null);

      const result = await service.startCheckout('conv-1', 'cust-1', 'merch-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('NO_CART');
      }
    });

    it('AC-13: should reject checkout if cart is empty (0 items)', async () => {
      cartRepository.findActiveCart.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.active,
      } as any);
      (prismaService.cartItem.count as jest.Mock).mockResolvedValue(0);

      const result = await service.startCheckout('conv-1', 'cust-1', 'merch-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('EMPTY_CART');
      }
    });

    it('should start checkout and persist state if cart has items', async () => {
      cartRepository.findActiveCart.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.active,
      } as any);
      (prismaService.cartItem.count as jest.Mock).mockResolvedValue(2);
      conversationRepository.findById.mockResolvedValue({ id: 'conv-1', metadata: null } as any);
      conversationRepository.update.mockResolvedValue({} as any);

      const result = await service.startCheckout('conv-1', 'cust-1', 'merch-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.cartId).toBe('cart-1');
      }
      expect(conversationRepository.update).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          metadata: expect.objectContaining({
            checkout: expect.objectContaining({ step: 'ASK_NAME', cartId: 'cart-1' }),
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-05 / REQ-05: persist checkout state in conversation metadata
  // ---------------------------------------------------------------------------

  describe('AC-05: getCheckoutState', () => {
    it('should return null if no conversation found', async () => {
      conversationRepository.findById.mockResolvedValue(null);

      const state = await service.getCheckoutState('conv-1');
      expect(state).toBeNull();
    });

    it('AC-05: should persist checkout state in conversation metadata', async () => {
      const checkoutState = {
        step: 'ASK_ADDRESS',
        data: { name: 'Juan Pérez' },
        startedAt: '2026-01-01T00:00:00.000Z',
        cartId: 'cart-1',
        invalidAttempts: 0,
      };
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { checkout: checkoutState },
      } as any);

      const state = await service.getCheckoutState('conv-1');
      expect(state).toMatchObject(checkoutState);
    });
  });

  // ---------------------------------------------------------------------------
  // captureField: update state and advance step
  // ---------------------------------------------------------------------------

  describe('captureField', () => {
    it('should capture name and advance to ASK_ADDRESS', async () => {
      const initialState = {
        step: 'ASK_NAME',
        data: {},
        startedAt: '',
        cartId: 'cart-1',
        invalidAttempts: 0,
      };
      conversationRepository.findById
        .mockResolvedValueOnce({ id: 'conv-1', metadata: { checkout: initialState } } as any) // getCheckoutState call
        .mockResolvedValueOnce({ id: 'conv-1', metadata: { checkout: initialState } } as any); // persistState call
      conversationRepository.update.mockResolvedValue({} as any);

      const result = await service.captureField('conv-1', 'name', 'Juan Pérez');

      expect(result.step).toBe('ASK_ADDRESS');
      expect(result.data.name).toBe('Juan Pérez');
    });

    it('should capture address and advance to SELECT_PAYMENT', async () => {
      const initialState = {
        step: 'ASK_ADDRESS',
        data: { name: 'Juan' },
        startedAt: '',
        cartId: 'cart-1',
        invalidAttempts: 0,
      };
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { checkout: initialState },
      } as any);
      conversationRepository.update.mockResolvedValue({} as any);

      const result = await service.captureField('conv-1', 'address', 'Calle 123 Bogotá');

      expect(result.step).toBe('SELECT_PAYMENT');
      expect(result.data.address).toBe('Calle 123 Bogotá');
    });

    it('should capture paymentMethod with label and advance to CONFIRM', async () => {
      const initialState = {
        step: 'SELECT_PAYMENT',
        data: { name: 'Juan', address: 'Addr' },
        startedAt: '',
        cartId: 'cart-1',
        invalidAttempts: 0,
      };
      conversationRepository.findById.mockResolvedValue({
        id: 'conv-1',
        metadata: { checkout: initialState },
      } as any);
      conversationRepository.update.mockResolvedValue({} as any);

      const result = await service.captureField('conv-1', 'paymentMethod', 'cod', 'Contraentrega');

      expect(result.step).toBe('CONFIRM');
      expect(result.data.paymentMethod).toBe('cod');
      expect(result.data.paymentMethodLabel).toBe('Contraentrega');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-03 / REQ-03: generateOrderCode sequential per merchant
  // ---------------------------------------------------------------------------

  describe('AC-03: generateOrderCode', () => {
    it('should generate sequential orderCode per merchant', async () => {
      (prismaService.merchantConfig.findUnique as jest.Mock).mockResolvedValue({
        orderCodePrefix: 'ORD',
      });
      orderRepository.countByMerchant.mockResolvedValue(0);
      orderRepository.findByOrderCode.mockResolvedValue(null);

      const code = await service.generateOrderCode('merch-1');
      expect(code).toBe('ORD-001');
    });

    it('should use merchant orderCodePrefix from config', async () => {
      (prismaService.merchantConfig.findUnique as jest.Mock).mockResolvedValue({
        orderCodePrefix: 'ROPA',
      });
      orderRepository.countByMerchant.mockResolvedValue(4);
      orderRepository.findByOrderCode.mockResolvedValue(null);

      const code = await service.generateOrderCode('merch-1');
      expect(code).toBe('ROPA-005');
    });

    it('should handle orderCode collision with retry', async () => {
      (prismaService.merchantConfig.findUnique as jest.Mock).mockResolvedValue({
        orderCodePrefix: 'ORD',
      });
      orderRepository.countByMerchant.mockResolvedValue(0);

      // First attempt collides, second succeeds
      orderRepository.findByOrderCode
        .mockResolvedValueOnce({ id: 'existing' } as any) // collision
        .mockResolvedValueOnce(null); // no collision on retry

      const code = await service.generateOrderCode('merch-1');
      expect(code).toBe('ORD-002'); // attempt + 1 offset
    });

    it('should fail after 3 orderCode collision retries', async () => {
      (prismaService.merchantConfig.findUnique as jest.Mock).mockResolvedValue({
        orderCodePrefix: 'ORD',
      });
      orderRepository.countByMerchant.mockResolvedValue(0);

      // Always collide
      orderRepository.findByOrderCode.mockResolvedValue({ id: 'existing' } as any);

      await expect(service.generateOrderCode('merch-1')).rejects.toThrow(
        'Failed to generate unique orderCode',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-09: OrderItem snapshots price + name from CartItem
  // AC-10: Cart.status = completed after order creation
  // ---------------------------------------------------------------------------

  describe('AC-09 / AC-10: createOrder', () => {
    it('AC-09: should snapshot price and name from CartItem', async () => {
      // Setup cart with 1 item
      const mockCartWithItems = {
        id: 'cart-1',
        customerId: 'cust-1',
        merchantId: 'merch-1',
        status: CartStatus.active,
        items: [
          {
            id: 'item-1',
            cartId: 'cart-1',
            variantId: 'var-1',
            quantity: 2,
            priceSnapshot: 60000,
            variant: {
              id: 'var-1',
              name: 'Talla M',
              productId: 'prod-1',
              product: { id: 'prod-1', name: 'Camiseta Azul' },
            },
          },
        ],
      };

      cartRepository.findByIdWithItems.mockResolvedValue(mockCartWithItems as any);
      (prismaService.merchantConfig.findUnique as jest.Mock).mockResolvedValue({
        orderCodePrefix: 'ORD',
      });
      orderRepository.countByMerchant.mockResolvedValue(0);
      orderRepository.findByOrderCode.mockResolvedValue(null);

      const txResult = {
        id: 'order-1',
        orderCode: 'ORD-001',
        items: [{ id: 'oi-1' }],
      };
      (prismaService.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const txClient = {
          order: { create: jest.fn().mockResolvedValue(txResult) },
          cart: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(txClient);
      });

      const result = await service.createOrder({
        merchantId: 'merch-1',
        customerId: 'cust-1',
        cartId: 'cart-1',
        customerName: 'Juan Pérez',
        customerPhone: '+573001234567',
        shippingAddress: 'Calle 123',
        paymentMethod: 'cod',
      });

      expect(result.orderCode).toBe('ORD-001');
      expect(result.totalAmount).toBe(120000); // 60000 * 2

      // Verify snapshot was applied in tx call
      const txFn = (prismaService.$transaction as jest.Mock).mock.calls[0][0];
      const txClient = {
        order: { create: jest.fn().mockResolvedValue(txResult) },
        cart: { update: jest.fn().mockResolvedValue({}) },
      };
      await txFn(txClient);

      expect(txClient.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              createMany: {
                data: expect.arrayContaining([
                  expect.objectContaining({
                    snapshotName: 'Camiseta Azul - Talla M',
                    unitPrice: 60000,
                    quantity: 2,
                  }),
                ]),
              },
            },
          }),
        }),
      );
    });

    it('AC-10: should mark Cart.status = completed after order creation', async () => {
      const mockCart = {
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            variantId: 'var-1',
            quantity: 1,
            priceSnapshot: 50000,
            variant: {
              id: 'var-1',
              name: 'V1',
              productId: 'p1',
              product: { id: 'p1', name: 'Product' },
            },
          },
        ],
      };

      cartRepository.findByIdWithItems.mockResolvedValue(mockCart as any);
      (prismaService.merchantConfig.findUnique as jest.Mock).mockResolvedValue({
        orderCodePrefix: 'ORD',
      });
      orderRepository.countByMerchant.mockResolvedValue(0);
      orderRepository.findByOrderCode.mockResolvedValue(null);

      const txResult = { id: 'order-1', orderCode: 'ORD-001', items: [] };
      (prismaService.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const txClient = {
          order: { create: jest.fn().mockResolvedValue(txResult) },
          cart: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(txClient);
      });

      await service.createOrder({
        merchantId: 'merch-1',
        customerId: 'cust-1',
        cartId: 'cart-1',
        customerName: 'Juan',
        customerPhone: '+57300',
        shippingAddress: 'Addr',
        paymentMethod: 'cod',
      });

      const txFn = (prismaService.$transaction as jest.Mock).mock.calls[0][0];
      const txClient = {
        order: { create: jest.fn().mockResolvedValue(txResult) },
        cart: { update: jest.fn().mockResolvedValue({}) },
      };
      await txFn(txClient);

      expect(txClient.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart-1' },
        data: { status: CartStatus.completed },
      });
    });
  });
});
