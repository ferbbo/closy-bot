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
  // Delivery S2.2-T2: OrderItem.notes + extras de domicilio (AC-08, AC-14)
  // ---------------------------------------------------------------------------

  describe('Delivery S2.2: createOrder con notes y extras', () => {
    const baseInput = {
      merchantId: 'merch-1',
      customerId: 'cust-1',
      cartId: 'cart-1',
      customerName: 'Ana',
      customerPhone: '+573001112233',
      shippingAddress: 'Calle 45 # 10-20',
      paymentMethod: 'cod',
    };
    const line = (id: string, notes: string, quantity: number, price: number) => ({
      id,
      cartId: 'cart-1',
      variantId: 'var-1',
      notes,
      quantity,
      priceSnapshot: price,
      variant: {
        id: 'var-1',
        name: 'Sencilla',
        productId: 'prod-1',
        product: { id: 'prod-1', name: 'Hamburguesa' },
      },
    });
    let orderCreate: jest.Mock;

    beforeEach(() => {
      cartRepository.findByIdWithItems.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.active,
        items: [line('i-1', 'sin cebolla', 2, 14000), line('i-2', '', 1, 14000)],
      } as any);
      (prismaService.merchantConfig.findUnique as jest.Mock).mockResolvedValue({
        orderCodePrefix: 'ORD',
      });
      orderRepository.countByMerchant.mockResolvedValue(0);
      orderRepository.findByOrderCode.mockResolvedValue(null);
      orderCreate = jest.fn().mockResolvedValue({ id: 'order-1', orderCode: 'ORD-001' });
      (prismaService.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn({ order: { create: orderCreate }, cart: { update: jest.fn() } }),
      );
    });

    const createdData = () => orderCreate.mock.calls[0][0].data;

    it('AC-08: copia CartItem.notes a OrderItem.notes (legacy "" no se envía)', async () => {
      await service.createOrder(baseInput);

      const items = createdData().items.createMany.data;
      expect(items[0]).toEqual(expect.objectContaining({ notes: 'sin cebolla', quantity: 2 }));
      expect(items[1]).not.toHaveProperty('notes');
    });

    it('sin extras: datos legacy idénticos (shippingCost 0, total = subtotal, sin campos nuevos)', async () => {
      const result = await service.createOrder(baseInput);

      const data = createdData();
      expect(result.totalAmount).toBe(42000);
      expect(data.totalAmount).toBe(42000);
      expect(data.shippingCost).toBe(0);
      expect(data.shippingAddress).toBe('Calle 45 # 10-20');
      for (const k of ['deliveryZone', 'etaMinutes', 'fulfillment', 'cashChangeFor']) {
        expect(data).not.toHaveProperty(k);
      }
    });

    it('AC-14: extras persisten zona, ETA, tarifa, fulfillment, cambio; total = subtotal + fee', async () => {
      const result = await service.createOrder(
        { ...baseInput, notes: 'Timbre dañado' },
        {
          deliveryZone: 'Cabecera',
          etaMinutes: 45,
          shippingCost: 4000,
          fulfillment: 'delivery',
          cashChangeFor: 50000,
          neighborhood: 'Cabecera',
          reference: 'Casa azul',
        },
      );

      const data = createdData();
      expect(result.totalAmount).toBe(46000);
      expect(data).toEqual(
        expect.objectContaining({
          totalAmount: 46000,
          shippingCost: 4000,
          deliveryZone: 'Cabecera',
          etaMinutes: 45,
          fulfillment: 'delivery',
          cashChangeFor: 50000,
          shippingAddress: 'Calle 45 # 10-20, Cabecera',
          notes: 'Timbre dañado | Referencia: Casa azul',
        }),
      );
    });

    it('extras: no duplica el barrio si la dirección ya lo contiene; pickup sin tarifa', async () => {
      await service.createOrder(
        { ...baseInput, shippingAddress: 'Cra 33 # 48-10, cabecera' },
        { fulfillment: 'pickup', neighborhood: 'Cabecera' },
      );

      const data = createdData();
      expect(data.shippingAddress).toBe('Cra 33 # 48-10, cabecera');
      expect(data.shippingCost).toBe(0);
      expect(data.totalAmount).toBe(42000);
      expect(data.fulfillment).toBe('pickup');
      expect(data.notes).toBeUndefined();
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
