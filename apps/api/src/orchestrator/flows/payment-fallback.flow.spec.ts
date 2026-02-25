/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PR-06: PaymentFallbackFlow unit tests
 * AC-10: Full fallback flow: ask order code → validate → ask confirm → create Payment manual
 * AC-11: paymentIntentId = "manual_{orderId}_{timestamp}"
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { PaymentFallbackFlow } from './payment-fallback.flow';
import { PaymentService } from '../../services/payment.service';
import { OrderRepository } from '../../persistence/repositories/order.repository';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import type { MerchantPlaybookData } from '../../services/playbook.service';

const mockMerchant: MerchantPlaybookData = {
  id: 'merchant-1',
  name: 'Test Store',
  industry: undefined,
  playbookConfig: null,
};

const mockOrder = {
  id: 'order-1',
  orderCode: 'ORD-001',
  merchantId: 'merchant-1',
  customerId: 'customer-1',
  status: OrderStatus.pending_payment,
  totalAmount: 120000,
  shippingAddress: 'Calle 1',
  customerName: 'Juan',
  customerPhone: '+573001234567',
  paymentMethod: 'transfer',
  notes: null,
  shippingCost: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PaymentFallbackFlow', () => {
  let flow: PaymentFallbackFlow;
  let paymentService: jest.Mocked<PaymentService>;
  let orderRepository: jest.Mocked<OrderRepository>;
  let prismaService: { conversation: any };

  // Helper to build metadata with payment_fallback state
  function conversationWithState(state: unknown) {
    return { metadata: { payment_fallback: state } };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentFallbackFlow,
        {
          provide: PaymentService,
          useValue: {
            generateManualPaymentIntentId: jest.fn().mockReturnValue('manual_order-1_999'),
            confirmPayment: jest.fn(),
          },
        },
        {
          provide: OrderRepository,
          useValue: {
            findByOrderCode: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            conversation: {
              findUnique: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
          },
        },
      ],
    }).compile();

    flow = module.get<PaymentFallbackFlow>(PaymentFallbackFlow);
    paymentService = module.get(PaymentService);
    orderRepository = module.get(OrderRepository);
    prismaService = module.get(PrismaService) as any;
  });

  // ---------------------------------------------------------------------------
  // AC-10: Initial trigger — ask for order code
  // ---------------------------------------------------------------------------
  describe('AC-10: initial trigger — start flow', () => {
    it('AC-10: should ask for order code when detecting CONFIRM_PAYMENT intent', async () => {
      // No active state
      (prismaService.conversation.findUnique as jest.Mock).mockResolvedValue({ metadata: null });

      const response = await flow.handle(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'ya pague',
      );

      expect(response).toContain('código');
      expect(response).toContain('ORD-001');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-10: Order code step — validate order
  // ---------------------------------------------------------------------------
  describe('AC-10: ASK_ORDER_CODE step', () => {
    it('AC-10: should validate order exists and ask for confirmation', async () => {
      (prismaService.conversation.findUnique as jest.Mock).mockResolvedValue(
        conversationWithState({ step: 'ASK_ORDER_CODE', startedAt: new Date().toISOString() }),
      );
      orderRepository.findByOrderCode.mockResolvedValue(mockOrder);

      const response = await flow.handle(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'ORD-001',
      );

      expect(response).toContain('ORD-001');
      expect(response).toContain('confirmar');
    });

    it('should return error if order not found', async () => {
      (prismaService.conversation.findUnique as jest.Mock).mockResolvedValue(
        conversationWithState({ step: 'ASK_ORDER_CODE', startedAt: new Date().toISOString() }),
      );
      orderRepository.findByOrderCode.mockResolvedValue(null);

      const response = await flow.handle(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'ORD-999',
      );

      expect(response).toContain('ORD-999');
      expect(response.toLowerCase()).toContain('no encontré');
    });

    it('should return graceful message if order already paid', async () => {
      (prismaService.conversation.findUnique as jest.Mock).mockResolvedValue(
        conversationWithState({ step: 'ASK_ORDER_CODE', startedAt: new Date().toISOString() }),
      );
      orderRepository.findByOrderCode.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.paid,
      });

      const response = await flow.handle(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'ORD-001',
      );

      expect(response).toContain('ya fue confirmado');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-10: ASK_CONFIRM step — user confirms
  // ---------------------------------------------------------------------------
  describe('AC-10: ASK_CONFIRM step — success', () => {
    it('AC-10: should confirm payment manually after user confirmation', async () => {
      (prismaService.conversation.findUnique as jest.Mock).mockResolvedValue(
        conversationWithState({
          step: 'ASK_CONFIRM',
          orderCode: 'ORD-001',
          orderId: 'order-1',
          orderAmount: 120000,
          startedAt: new Date().toISOString(),
        }),
      );
      paymentService.confirmPayment.mockResolvedValue({
        success: true,
        paymentId: 'payment-1',
      });

      const response = await flow.handle(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'confirmar',
      );

      expect(response).toContain('ORD-001');
      expect(response).toContain('registrado');
      expect(paymentService.confirmPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          paymentIntentId: 'manual_order-1_999',
        }),
      );
    });

    it('should handle cancellation gracefully', async () => {
      (prismaService.conversation.findUnique as jest.Mock).mockResolvedValue(
        conversationWithState({
          step: 'ASK_CONFIRM',
          orderCode: 'ORD-001',
          orderId: 'order-1',
          orderAmount: 120000,
          startedAt: new Date().toISOString(),
        }),
      );

      const response = await flow.handle(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'cancelar',
      );

      expect(response).toContain('cancel');
      expect(paymentService.confirmPayment).not.toHaveBeenCalled();
    });
  });
});
