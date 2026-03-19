/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PR-05: CheckoutService unit tests
 * AC-03: orderCode generation sequential per merchant
 * AC-04: reject checkout if cart empty
 * AC-05: persist checkout state via ExpectingService (PR-04.0 REQ-11)
 * AC-09: snapshot price + name from CartItem
 * AC-10: Cart.status = completed after order creation
 * AC-11 (PR-04.0): CheckoutService delegates 100% to ExpectingService
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { CartRepository } from '../persistence/repositories/cart.repository';
import { OrderRepository } from '../persistence/repositories/order.repository';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { ExpectingService } from './expecting.service';
import { CartStatus } from '@prisma/client';
import type { ExpectingState } from '../orchestrator/types/expecting.types';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let cartRepository: jest.Mocked<CartRepository>;
  let orderRepository: jest.Mocked<OrderRepository>;
  let expectingService: jest.Mocked<ExpectingService>;
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
          provide: ExpectingService,
          useValue: {
            setExpecting: jest.fn(),
            getExpecting: jest.fn(),
            clearExpecting: jest.fn(),
            isExpecting: jest.fn(),
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
    expectingService = module.get(ExpectingService);
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
      expectingService.setExpecting.mockResolvedValue(undefined);

      const result = await service.startCheckout('conv-1', 'cust-1', 'merch-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.cartId).toBe('cart-1');
      }
      expect(expectingService.setExpecting).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          flow: 'checkout',
          type: 'input_name',
          data: expect.objectContaining({ cartId: 'cart-1' }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-05 / REQ-05 / REQ-11: persist checkout state via ExpectingService
  // ---------------------------------------------------------------------------

  describe('AC-05: getCheckoutState', () => {
    it('should return null if no expecting state found', async () => {
      expectingService.getExpecting.mockResolvedValue(null);

      const state = await service.getCheckoutState('conv-1');
      expect(state).toBeNull();
    });

    it('should return null if expecting state is not checkout flow', async () => {
      expectingService.getExpecting.mockResolvedValue({
        flow: 'search_selection',
        type: 'select_product',
        data: {},
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      } as ExpectingState);

      const state = await service.getCheckoutState('conv-1');
      expect(state).toBeNull();
    });

    it('AC-05: should return CheckoutState mapped from ExpectingState', async () => {
      const expectingState: ExpectingState = {
        flow: 'checkout',
        type: 'input_address',
        data: {
          cartId: 'cart-1',
          checkoutName: 'Juan Pérez',
          startedAt: '2026-01-01T00:00:00.000Z',
          invalidAttempts: 0,
        },
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };
      expectingService.getExpecting.mockResolvedValue(expectingState);

      const state = await service.getCheckoutState('conv-1');
      expect(state).not.toBeNull();
      expect(state!.step).toBe('ASK_ADDRESS');
      expect(state!.data.name).toBe('Juan Pérez');
      expect(state!.cartId).toBe('cart-1');
    });
  });

  // ---------------------------------------------------------------------------
  // captureField: update state and advance step
  // ---------------------------------------------------------------------------

  describe('captureField', () => {
    /** Helper that returns a mocked ExpectingState for checkout */
    function mockCheckoutExpecting(step: string, cartId = 'cart-1'): ExpectingState {
      const typeMap: Record<string, string> = {
        ASK_NAME: 'input_name',
        ASK_ADDRESS: 'input_address',
        SELECT_PAYMENT: 'select_payment',
        CONFIRM: 'confirm_order',
      };
      return {
        flow: 'checkout',
        type: (typeMap[step] ?? 'input_name') as any,
        data: { cartId, invalidAttempts: 0, startedAt: '' },
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };
    }

    it('should capture name and advance to ASK_ADDRESS', async () => {
      expectingService.getExpecting.mockResolvedValue(mockCheckoutExpecting('ASK_NAME'));
      expectingService.setExpecting.mockResolvedValue(undefined);

      const result = await service.captureField('conv-1', 'name', 'Juan Pérez');

      expect(result.step).toBe('ASK_ADDRESS');
      expect(result.data.name).toBe('Juan Pérez');
      expect(expectingService.setExpecting).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({ flow: 'checkout', type: 'input_address' }),
      );
    });

    it('should capture address and advance to SELECT_PAYMENT', async () => {
      expectingService.getExpecting.mockResolvedValue(mockCheckoutExpecting('ASK_ADDRESS'));
      expectingService.setExpecting.mockResolvedValue(undefined);

      const result = await service.captureField('conv-1', 'address', 'Calle 123 Bogotá');

      expect(result.step).toBe('SELECT_PAYMENT');
      expect(result.data.address).toBe('Calle 123 Bogotá');
    });

    it('should capture paymentMethod with label and advance to CONFIRM', async () => {
      expectingService.getExpecting.mockResolvedValue(mockCheckoutExpecting('SELECT_PAYMENT'));
      expectingService.setExpecting.mockResolvedValue(undefined);

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

  // ---------------------------------------------------------------------------
  // AC-11 (PR-04.0): CheckoutService delegates 100% to ExpectingService
  // REQ-11: no direct metadata access in CheckoutService
  // ---------------------------------------------------------------------------

  describe('AC-11 (PR-04.0): CheckoutService - uses ExpectingService', () => {
    it('AC-11: startCheckout calls expectingService.setExpecting with flow=checkout', async () => {
      cartRepository.findActiveCart.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.active,
      } as any);
      (prismaService.cartItem.count as jest.Mock).mockResolvedValue(1);
      expectingService.setExpecting.mockResolvedValue(undefined);

      await service.startCheckout('conv-1', 'cust-1', 'merch-1');

      expect(expectingService.setExpecting).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          flow: 'checkout',
          type: 'input_name',
          data: expect.objectContaining({ cartId: 'cart-1' }),
        }),
      );
    });

    it('AC-11: getCheckoutState calls expectingService.getExpecting (not direct DB)', async () => {
      expectingService.getExpecting.mockResolvedValue(null);

      await service.getCheckoutState('conv-1');

      expect(expectingService.getExpecting).toHaveBeenCalledWith('conv-1');
    });

    it('AC-11: resetCheckoutState calls expectingService.clearExpecting', async () => {
      expectingService.clearExpecting.mockResolvedValue(undefined);

      await service.resetCheckoutState('conv-1');

      expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    });

    it('AC-11: markCompleted calls expectingService.clearExpecting (COMPLETED = clear)', async () => {
      expectingService.clearExpecting.mockResolvedValue(undefined);

      await service.markCompleted('conv-1');

      expect(expectingService.clearExpecting).toHaveBeenCalledWith('conv-1');
    });
  });
});
