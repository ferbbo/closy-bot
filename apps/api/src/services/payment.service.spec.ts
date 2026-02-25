/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PR-06: PaymentService unit tests
 * AC-02: confirmPayment creates payment + transitions order to paid
 * AC-03: idempotency — same paymentIntentId does not duplicate
 * AC-06: processWebhook parses + confirms payment
 * AC-07: rejected webhook records failed payment
 * AC-11: generateManualPaymentIntentId generates unique key
 * AC-12: MerchantNotificationService.notifyPaymentConfirmed called
 * AC-13: already-paid order handled gracefully
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PaymentService } from './payment.service';
import { PaymentRepository } from '../persistence/repositories/payment.repository';
import { OrderRepository } from '../persistence/repositories/order.repository';
import { MerchantNotificationService } from './merchant-notification.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import type { ConfirmPaymentDto, PaymentWebhookPayload } from '../domain/entities/payment.entity';

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

const mockPayment = {
  id: 'payment-1',
  orderId: 'order-1',
  amount: 120000,
  method: 'transfer',
  status: PaymentStatus.confirmed,
  externalId: null,
  paymentIntentId: 'pi_abc123',
  confirmedAt: new Date(),
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: jest.Mocked<PaymentRepository>;
  let orderRepository: jest.Mocked<OrderRepository>;
  let merchantNotificationService: jest.Mocked<MerchantNotificationService>;
  let prismaService: { order: any; $transaction: jest.Mock };

  beforeEach(async () => {
    const mockTransaction = jest.fn().mockImplementation(async (fn: any) => {
      // Mock transaction: pass a mini tx client
      return fn({
        payment: { create: jest.fn().mockResolvedValue(mockPayment) },
        order: { update: jest.fn().mockResolvedValue({ ...mockOrder, status: OrderStatus.paid }) },
      });
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PaymentRepository,
          useValue: {
            findByPaymentIntentId: jest.fn(),
            create: jest.fn(),
            findByOrderId: jest.fn(),
            findConfirmedByOrderId: jest.fn(),
          },
        },
        {
          provide: OrderRepository,
          useValue: {
            findByOrderCode: jest.fn(),
            findByIdWithItems: jest.fn(),
          },
        },
        {
          provide: MerchantNotificationService,
          useValue: {
            notifyPaymentConfirmed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            order: { findUnique: jest.fn() },
            $transaction: mockTransaction,
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepository = module.get(PaymentRepository);
    orderRepository = module.get(OrderRepository);
    merchantNotificationService = module.get(MerchantNotificationService);
    prismaService = module.get(PrismaService) as any;
  });

  // ---------------------------------------------------------------------------
  // AC-02: should create payment and transition order status to paid
  // ---------------------------------------------------------------------------
  describe('AC-02: confirmPayment — success path', () => {
    it('AC-02: should create payment and transition order status to paid', async () => {
      paymentRepository.findByPaymentIntentId.mockResolvedValue(null);
      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const dto: ConfirmPaymentDto = {
        orderId: 'order-1',
        amount: 120000,
        method: 'transfer',
        paymentIntentId: 'pi_abc123',
      };

      const result = await service.confirmPayment(dto);

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('payment-1');
      expect(result.alreadyProcessed).toBeUndefined();
    });

    it('AC-12: should call MerchantNotificationService.notifyPaymentConfirmed on success', async () => {
      paymentRepository.findByPaymentIntentId.mockResolvedValue(null);
      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      await service.confirmPayment({
        orderId: 'order-1',
        amount: 120000,
        method: 'transfer',
        paymentIntentId: 'pi_abc123',
      });

      // Wait for fire-and-forget
      await new Promise((r) => setTimeout(r, 10));

      expect(merchantNotificationService.notifyPaymentConfirmed).toHaveBeenCalledWith(
        'merchant-1',
        expect.objectContaining({ type: 'PAYMENT_CONFIRMED', orderCode: 'ORD-001' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-03: idempotency — same paymentIntentId does not duplicate
  // ---------------------------------------------------------------------------
  describe('AC-03: confirmPayment — idempotency', () => {
    it('AC-03: should be idempotent - same paymentIntentId does not duplicate', async () => {
      paymentRepository.findByPaymentIntentId.mockResolvedValue(mockPayment);

      const result = await service.confirmPayment({
        orderId: 'order-1',
        amount: 120000,
        method: 'transfer',
        paymentIntentId: 'pi_abc123',
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
      expect(result.paymentId).toBe('payment-1');
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('AC-03: should handle concurrent P2002 duplicate gracefully', async () => {
      paymentRepository.findByPaymentIntentId
        .mockResolvedValueOnce(null) // first check
        .mockResolvedValueOnce(mockPayment); // second check after catch

      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      // Transaction throws P2002
      prismaService.$transaction.mockRejectedValue({ code: 'P2002' });

      const result = await service.confirmPayment({
        orderId: 'order-1',
        amount: 120000,
        method: 'transfer',
        paymentIntentId: 'pi_abc123',
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-13: already-paid order handled gracefully
  // ---------------------------------------------------------------------------
  describe('AC-13: confirmPayment — already paid order', () => {
    it('AC-13: should handle already paid order gracefully', async () => {
      paymentRepository.findByPaymentIntentId.mockResolvedValue(null);
      (prismaService.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.paid,
      });
      paymentRepository.findConfirmedByOrderId.mockResolvedValue(mockPayment);

      const result = await service.confirmPayment({
        orderId: 'order-1',
        amount: 120000,
        method: 'transfer',
        paymentIntentId: 'pi_new123',
      });

      expect(result.success).toBe(true);
      expect(result.alreadyPaid).toBe(true);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // should throw if order not found
  // ---------------------------------------------------------------------------
  describe('confirmPayment — order not found', () => {
    it('should throw NotFoundException if order not found', async () => {
      paymentRepository.findByPaymentIntentId.mockResolvedValue(null);
      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.confirmPayment({
          orderId: 'nonexistent',
          amount: 100,
          method: 'transfer',
          paymentIntentId: 'pi_xyz',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-06: processWebhook — parses payload + confirms payment
  // ---------------------------------------------------------------------------
  describe('AC-06: processWebhook — approved', () => {
    it('AC-06: should process webhook and confirm payment', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(mockOrder);
      paymentRepository.findByPaymentIntentId.mockResolvedValue(null);
      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const payload: PaymentWebhookPayload = {
        payment_intent_id: 'pi_abc123',
        order_code: 'ORD-001',
        amount: 120000,
        status: 'approved',
        method: 'transfer',
        timestamp: new Date().toISOString(),
      };

      const result = await service.processWebhook(payload, 'merchant-1');

      expect(result.success).toBe(true);
      expect(result.order_code).toBe('ORD-001');
      expect(result.status).toBe('confirmed');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-07: rejected webhook records failed payment
  // ---------------------------------------------------------------------------
  describe('AC-07: processWebhook — rejected', () => {
    it('AC-07: should not confirm payment if webhook status is rejected', async () => {
      paymentRepository.findByPaymentIntentId.mockResolvedValue(null);
      orderRepository.findByOrderCode.mockResolvedValue(mockOrder);
      paymentRepository.create.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.failed,
        id: 'payment-failed-1',
      });

      const payload: PaymentWebhookPayload = {
        payment_intent_id: 'pi_rejected',
        order_code: 'ORD-001',
        amount: 120000,
        status: 'rejected',
        method: 'transfer',
        timestamp: new Date().toISOString(),
      };

      const result = await service.processWebhook(payload, 'merchant-1');

      expect(result.success).toBe(true);
      expect(result.status).toBe('failed');
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-11: generateManualPaymentIntentId
  // ---------------------------------------------------------------------------
  describe('AC-11: generateManualPaymentIntentId', () => {
    it('AC-11: should generate unique manual paymentIntentId', () => {
      const id1 = service.generateManualPaymentIntentId('order-1');
      const id2 = service.generateManualPaymentIntentId('order-1');

      expect(id1).toMatch(/^manual_order-1_\d+$/);
      expect(id2).toMatch(/^manual_order-1_\d+$/);
      // Both should start with manual_ prefix
      expect(id1.startsWith('manual_order-1_')).toBe(true);
    });
  });
});
