/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PR-05: CheckoutFlow unit tests
 * AC-07: Flow executes steps in order (ASK_NAME → ASK_ADDRESS → SELECT_PAYMENT → CONFIRM)
 * AC-08: Bot shows payment methods from MerchantConfig
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutFlow } from './checkout.flow';
import { CheckoutService, CheckoutState } from '../../services/checkout.service';
import { MerchantNotificationService } from '../../services/merchant-notification.service';
import { CustomerService } from '../../services/customer.service';

const mockMerchant = {
  id: 'merch-1',
  name: 'Test Store',
  industry: 'ropa' as any,
  playbookConfig: null,
};

const emptyState: CheckoutState = {
  step: 'ASK_NAME',
  data: {},
  startedAt: '2026-01-01T00:00:00.000Z',
  cartId: 'cart-1',
  invalidAttempts: 0,
};

describe('CheckoutFlow', () => {
  let flow: CheckoutFlow;
  let checkoutService: jest.Mocked<CheckoutService>;
  let merchantNotificationService: jest.Mocked<MerchantNotificationService>;
  let customerService: jest.Mocked<CustomerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutFlow,
        {
          provide: CheckoutService,
          useValue: {
            getCheckoutState: jest.fn(),
            startCheckout: jest.fn(),
            captureField: jest.fn(),
            getPaymentMethods: jest.fn(),
            incrementInvalidAttempts: jest.fn(),
            resetCheckoutState: jest.fn(),
            markCompleted: jest.fn(),
            createOrder: jest.fn(),
          },
        },
        {
          provide: MerchantNotificationService,
          useValue: {
            notifyNewOrder: jest.fn(),
            formatAmount: jest.fn().mockReturnValue('$60,000 COP'),
          },
        },
        {
          provide: CustomerService,
          useValue: {
            findById: jest.fn(),
            resolveByPhone: jest.fn(),
          },
        },
      ],
    }).compile();

    flow = module.get<CheckoutFlow>(CheckoutFlow);
    checkoutService = module.get(CheckoutService);
    merchantNotificationService = module.get(MerchantNotificationService);
    customerService = module.get(CustomerService);
  });

  // ---------------------------------------------------------------------------
  // getActiveState
  // ---------------------------------------------------------------------------

  describe('getActiveState', () => {
    it('should return null when no state exists', async () => {
      checkoutService.getCheckoutState.mockResolvedValue(null);
      const state = await flow.getActiveState('conv-1');
      expect(state).toBeNull();
    });

    it('should return null when step is COMPLETED', async () => {
      checkoutService.getCheckoutState.mockResolvedValue({
        ...emptyState,
        step: 'COMPLETED',
      });
      const state = await flow.getActiveState('conv-1');
      expect(state).toBeNull();
    });

    it('should return state when checkout is in progress', async () => {
      checkoutService.getCheckoutState.mockResolvedValue(emptyState);
      const state = await flow.getActiveState('conv-1');
      expect(state).toEqual(emptyState);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-13: handle — reject checkout if cart empty
  // ---------------------------------------------------------------------------

  describe('AC-13: handle — cart empty', () => {
    it('should reject and return empty cart message', async () => {
      checkoutService.getCheckoutState.mockResolvedValue(null);
      checkoutService.startCheckout.mockResolvedValue({ ok: false, reason: 'EMPTY_CART' });

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'quiero pagar');

      expect(result).toContain('carrito está vacío');
      expect(checkoutService.startCheckout).toHaveBeenCalledWith('conv-1', 'cust-1', 'merch-1');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-07: start checkout and ask for name
  // ---------------------------------------------------------------------------

  describe('AC-07: start checkout', () => {
    it('should start checkout and ask for name', async () => {
      checkoutService.getCheckoutState.mockResolvedValue(null);
      checkoutService.startCheckout.mockResolvedValue({ ok: true, cartId: 'cart-1' });

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'quiero pagar');

      expect(result).toContain('nombre completo');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-07: transition from ASK_NAME to ASK_ADDRESS
  // ---------------------------------------------------------------------------

  describe('AC-07: ASK_NAME → ASK_ADDRESS', () => {
    it('should capture name and ask for address', async () => {
      const askNameState = { ...emptyState, step: 'ASK_NAME' as const };
      checkoutService.getCheckoutState.mockResolvedValue(askNameState);
      checkoutService.captureField.mockResolvedValue({
        ...askNameState,
        step: 'ASK_ADDRESS',
        data: { name: 'Juan Pérez' },
      });

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'Juan Pérez');

      expect(result).toContain('dirección');
      expect(checkoutService.captureField).toHaveBeenCalledWith('conv-1', 'name', 'Juan Pérez');
    });

    it('should reject name that is too short', async () => {
      const askNameState = { ...emptyState, step: 'ASK_NAME' as const };
      checkoutService.getCheckoutState.mockResolvedValue(askNameState);

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'A');

      expect(result).toContain('nombre completo');
      expect(checkoutService.captureField).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-08: show payment methods from MerchantConfig
  // ---------------------------------------------------------------------------

  describe('AC-08: show payment methods', () => {
    it('should show payment methods from MerchantConfig after address capture', async () => {
      const askAddressState = {
        ...emptyState,
        step: 'ASK_ADDRESS' as const,
        data: { name: 'Juan' },
      };
      checkoutService.getCheckoutState.mockResolvedValue(askAddressState);
      checkoutService.captureField.mockResolvedValue({
        ...askAddressState,
        step: 'SELECT_PAYMENT',
        data: { name: 'Juan', address: 'Calle 123' },
      });
      checkoutService.getPaymentMethods.mockResolvedValue([
        { type: 'cod', label: 'Contraentrega' },
        { type: 'transfer', label: 'Transferencia bancaria' },
      ]);

      const result = await flow.handle(
        mockMerchant,
        'conv-1',
        'cust-1',
        'merch-1',
        'Calle 123 Bogotá',
      );

      expect(result).toContain('Contraentrega');
      expect(result).toContain('Transferencia bancaria');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-07: handle invalid payment selection
  // ---------------------------------------------------------------------------

  describe('handle invalid payment method selection', () => {
    it('should show error on invalid selection and increment attempts', async () => {
      const selectState = {
        ...emptyState,
        step: 'SELECT_PAYMENT' as const,
        data: { name: 'Juan', address: 'Addr' },
        invalidAttempts: 0,
      };
      checkoutService.getCheckoutState.mockResolvedValue(selectState);
      checkoutService.getPaymentMethods.mockResolvedValue([
        { type: 'cod', label: 'Contraentrega' },
      ]);
      checkoutService.incrementInvalidAttempts.mockResolvedValue({
        ...selectState,
        invalidAttempts: 1,
      });

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'paypal');

      expect(result).toContain('opción válida');
      expect(checkoutService.incrementInvalidAttempts).toHaveBeenCalledWith('conv-1');
    });

    it('should cancel checkout after 3 invalid attempts', async () => {
      const selectState = {
        ...emptyState,
        step: 'SELECT_PAYMENT' as const,
        data: { name: 'Juan', address: 'Addr' },
        invalidAttempts: 0,
      };
      checkoutService.getCheckoutState.mockResolvedValue(selectState);
      checkoutService.getPaymentMethods.mockResolvedValue([
        { type: 'cod', label: 'Contraentrega' },
      ]);
      checkoutService.incrementInvalidAttempts.mockResolvedValue({
        ...selectState,
        invalidAttempts: 3, // MAX reached
      });
      checkoutService.resetCheckoutState.mockResolvedValue();

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'invalid');

      expect(result).toContain('cancelado');
      expect(checkoutService.resetCheckoutState).toHaveBeenCalledWith('conv-1');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-13 (PR-FE-OB-2): Payment link URL in checkout message
  // ---------------------------------------------------------------------------

  describe('AC-13 (PR-FE-OB-2): payment_link URL appears in checkout message', () => {
    it('includes paymentLinkUrl in payment selection message when type is payment_link', async () => {
      const askAddressState2 = {
        step: 'ASK_ADDRESS' as const,
        data: { name: 'María' } as Record<string, string>,
        startedAt: '',
        cartId: 'cart-1',
        invalidAttempts: 0,
      };
      checkoutService.getCheckoutState.mockResolvedValue(askAddressState2);
      const capturedWithAddress = {
        ...askAddressState2,
        step: 'SELECT_PAYMENT' as const,
        data: { name: 'María', address: 'Calle 1' },
      };
      checkoutService.captureField.mockResolvedValue(capturedWithAddress);
      checkoutService.getPaymentMethods.mockResolvedValue([
        { type: 'cod', label: 'Contraentrega' },
        {
          type: 'payment_link',
          label: 'Link de pago',
          paymentLinkUrl: 'https://link.mercadopago.com.co/mi-tienda',
        },
      ]);

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'Calle 1 #2-3');

      expect(result).toContain('https://link.mercadopago.com.co/mi-tienda');
      expect(result).toContain('Link de pago');
    });

    it('does NOT include URL when type is not payment_link', async () => {
      // Build prompt with only COD (no payment_link) — URL should never appear
      const selectState = {
        step: 'SELECT_PAYMENT' as const,
        data: { name: 'Juan', address: 'Addr' },
        startedAt: '',
        cartId: 'cart-1',
        invalidAttempts: 0,
      };
      checkoutService.getCheckoutState.mockResolvedValue(selectState);
      checkoutService.getPaymentMethods.mockResolvedValue([
        { type: 'cod', label: 'Contraentrega' },
      ]);
      checkoutService.captureField.mockResolvedValue({
        ...selectState,
        data: {
          name: 'Juan',
          address: 'Addr',
          paymentMethod: 'cod',
          paymentMethodLabel: 'Contraentrega',
        },
        step: 'CONFIRM',
      });

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', '1');

      expect(result).not.toContain('https://');
    });
  });

  // ---------------------------------------------------------------------------

  describe('AC-13 (PR-FE-OB-2): payment_link URL appears in checkout message', () => {
    it('includes paymentLinkUrl in payment selection message when type is payment_link', async () => {
      const askAddressState2 = {
        step: 'ASK_ADDRESS' as const,
        data: { name: 'María' } as Record<string, string>,
        startedAt: '',
        cartId: 'cart-1',
        invalidAttempts: 0,
      };
      checkoutService.getCheckoutState.mockResolvedValue(askAddressState2);
      const capturedWithAddress = {
        ...askAddressState2,
        step: 'SELECT_PAYMENT' as const,
        data: { name: 'María', address: 'Calle 1' },
      };
      checkoutService.captureField.mockResolvedValue(capturedWithAddress);
      checkoutService.getPaymentMethods.mockResolvedValue([
        { type: 'cod', label: 'Contraentrega' },
        {
          type: 'payment_link',
          label: 'Link de pago',
          paymentLinkUrl: 'https://link.mercadopago.com.co/mi-tienda',
        },
      ]);

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'Calle 1 #2-3');

      expect(result).toContain('https://link.mercadopago.com.co/mi-tienda');
      expect(result).toContain('Link de pago');
    });

    it('does NOT include URL when type is not payment_link', async () => {
      // Build prompt with only COD (no payment_link) — URL should never appear
      const selectState = {
        step: 'SELECT_PAYMENT' as const,
        data: { name: 'Juan', address: 'Addr' },
        startedAt: '',
        cartId: 'cart-1',
        invalidAttempts: 0,
      };
      checkoutService.getCheckoutState.mockResolvedValue(selectState);
      checkoutService.getPaymentMethods.mockResolvedValue([
        { type: 'cod', label: 'Contraentrega' },
      ]);
      checkoutService.captureField.mockResolvedValue({
        ...selectState,
        data: {
          name: 'Juan',
          address: 'Addr',
          paymentMethod: 'cod',
          paymentMethodLabel: 'Contraentrega',
        },
        step: 'CONFIRM',
      });

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', '1');

      expect(result).not.toContain('https://');
    });
  });

  // ---------------------------------------------------------------------------

  describe('CONFIRM step', () => {
    const confirmState: CheckoutState = {
      step: 'CONFIRM',
      data: {
        name: 'Juan',
        address: 'Addr',
        paymentMethod: 'cod',
        paymentMethodLabel: 'Contraentrega',
      },
      startedAt: '',
      cartId: 'cart-1',
      invalidAttempts: 0,
    };

    it('should repeat confirmation if user does not respond confirmar', async () => {
      checkoutService.getCheckoutState.mockResolvedValue(confirmState);

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'maybe');

      expect(result).toContain('confirmar');
    });

    it('should create order and notify merchant on confirmar', async () => {
      checkoutService.getCheckoutState.mockResolvedValue(confirmState);
      customerService.findById.mockResolvedValue({ id: 'cust-1', phone: '+573001234567' } as any);
      checkoutService.createOrder.mockResolvedValue({
        orderCode: 'ORD-001',
        orderId: 'order-1',
        totalAmount: 60000,
        items: [{ name: 'Shirt', qty: 1, price: 60000 }],
      });
      checkoutService.markCompleted.mockResolvedValue();
      merchantNotificationService.notifyNewOrder.mockResolvedValue();

      const result = await flow.handle(mockMerchant, 'conv-1', 'cust-1', 'merch-1', 'confirmar');

      expect(result).toContain('ORD-001');
      expect(result).toContain('registrado');
      expect(checkoutService.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ cartId: 'cart-1', paymentMethod: 'cod' }),
      );
      expect(merchantNotificationService.notifyNewOrder).toHaveBeenCalled();
    });
  });
});
