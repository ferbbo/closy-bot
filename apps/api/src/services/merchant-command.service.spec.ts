/**
 * MerchantCommandService Unit Tests
 * PR-05.1 REQ-07..REQ-18
 * AC-06: confirmar transitions pending_payment → confirmed
 * AC-07: rechazar transitions → cancelled + reason
 * AC-08: pagado transitions → paid
 * AC-09: enviado transitions → shipped
 * AC-10: pedido shows order details
 * AC-11: pendientes lists pending orders
 * AC-12: hoy shows daily summary
 * AC-13: ayuda shows help text
 * AC-14: pausar/activar bot
 * AC-15: customer notification via OutboxMessage
 * AC-16: invalid transitions rejected
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MerchantCommandService } from './merchant-command.service';
import { MessageRelayService } from './message-relay.service'; // PR-05.2
import { PrismaService } from '../persistence/prisma/prisma.service';
import { OrderRepository } from '../persistence/repositories/order.repository';
import { OutboxRepository } from '../persistence/repositories/outbox.repository';
import { OrderStatus, OutboxMessage } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { OrderWithItems } from '../persistence/repositories/order.repository';

const MERCHANT_ID = 'merchant-test-1';
const ORDER_CODE = 'ORD-001';
const CUSTOMER_ID = 'customer-test-1';
const CUSTOMER_PHONE = '+573001234567';
const CUSTOMER_NAME = 'Juan Pérez';

function makeOrder(status: OrderStatus, code = ORDER_CODE) {
  return {
    id: `order-${code}`,
    orderCode: code,
    merchantId: MERCHANT_ID,
    customerId: CUSTOMER_ID,
    customerName: CUSTOMER_NAME,
    customerPhone: CUSTOMER_PHONE,
    shippingAddress: 'Calle 10 # 20-30',
    paymentMethod: 'cod',
    status,
    totalAmount: new Decimal('150000'),
    shippingCost: new Decimal('0'),
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeOrderWithItems(status: OrderStatus) {
  return {
    ...makeOrder(status),
    items: [
      {
        id: 'item-1',
        orderId: `order-${ORDER_CODE}`,
        snapshotName: 'Camiseta azul - Talla M',
        quantity: 2,
        unitPrice: new Decimal('75000'),
        variantId: 'variant-1',
        createdAt: new Date(),
        variant: {
          id: 'variant-1',
          name: 'Talla M',
          productId: 'product-1',
          product: { id: 'product-1', name: 'Camiseta azul' },
        },
      },
    ],
  };
}

describe('MerchantCommandService', () => {
  let service: MerchantCommandService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let outboxRepository: jest.Mocked<OutboxRepository>;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantCommandService,
        {
          provide: PrismaService,
          useValue: {
            merchant: {
              update: jest.fn(),
            },
          },
        },
        {
          provide: OrderRepository,
          useValue: {
            findByOrderCode: jest.fn(),
            findByOrderCodeWithItems: jest.fn(),
            updateStatus: jest.fn(),
            findPendingByMerchant: jest.fn(),
            getDailySummary: jest.fn(),
          },
        },
        {
          provide: OutboxRepository,
          useValue: {
            create: jest.fn(),
          },
        },
        // PR-05.2: MessageRelayService mock
        {
          provide: MessageRelayService,
          useValue: {
            sendMessageToCustomer: jest.fn().mockResolvedValue('✅ Mensaje enviado'),
            activateHandoff: jest.fn().mockResolvedValue('✅ Handoff activo'),
            deactivateHandoff: jest.fn().mockResolvedValue('✅ Handoff cerrado'),
          },
        },
      ],
    }).compile();

    service = module.get<MerchantCommandService>(MerchantCommandService);
    orderRepository = module.get(OrderRepository);
    outboxRepository = module.get(OutboxRepository);
    prisma = module.get(PrismaService);
  });

  // ---------------------------------------------------------------------------
  // AC-06: confirmar
  // ---------------------------------------------------------------------------
  describe('AC-06: confirmOrder()', () => {
    it('should transition pending_payment → confirmed', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('pending_payment'));
      orderRepository.updateStatus.mockResolvedValue(makeOrder('confirmed'));
      outboxRepository.create.mockResolvedValue({} as OutboxMessage);

      const result = await service.confirmOrder(MERCHANT_ID, ORDER_CODE);

      expect(orderRepository.updateStatus).toHaveBeenCalledWith(expect.any(String), 'confirmed');
      expect(outboxRepository.create).toHaveBeenCalledTimes(1); // AC-15: customer notified
      expect(result).toContain('✅');
      expect(result).toContain(ORDER_CODE);
    });

    it('should be idempotent: already confirmed → info message, no duplicate notification', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('confirmed'));

      const result = await service.confirmOrder(MERCHANT_ID, ORDER_CODE);

      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
      expect(outboxRepository.create).not.toHaveBeenCalled();
      expect(result).toContain('ℹ️');
    });

    it('should return error for order not found', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(null);
      const result = await service.confirmOrder(MERCHANT_ID, ORDER_CODE);
      expect(result).toContain('❌');
      expect(result).toContain(ORDER_CODE);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-07: rechazar
  // ---------------------------------------------------------------------------
  describe('AC-07: rejectOrder()', () => {
    it('should transition pending_payment → cancelled + notify customer with reason', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('pending_payment'));
      orderRepository.updateStatus.mockResolvedValue(makeOrder('cancelled'));
      outboxRepository.create.mockResolvedValue({} as OutboxMessage);

      const result = await service.rejectOrder(MERCHANT_ID, ORDER_CODE, 'no hay stock');

      expect(orderRepository.updateStatus).toHaveBeenCalledWith(expect.any(String), 'cancelled');
      expect(outboxRepository.create).toHaveBeenCalledTimes(1); // AC-15
      expect(result).toContain('✅');
    });

    it('should transition without reason', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('pending_payment'));
      orderRepository.updateStatus.mockResolvedValue(makeOrder('cancelled'));
      outboxRepository.create.mockResolvedValue({} as OutboxMessage);

      const result = await service.rejectOrder(MERCHANT_ID, ORDER_CODE);
      expect(result).toContain('✅');
    });

    it('should be idempotent: already cancelled → info message', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('cancelled'));
      const result = await service.rejectOrder(MERCHANT_ID, ORDER_CODE);
      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
      expect(result).toContain('ℹ️');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-08: pagado
  // ---------------------------------------------------------------------------
  describe('AC-08: markAsPaid()', () => {
    it('should transition confirmed → paid', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('confirmed'));
      orderRepository.updateStatus.mockResolvedValue(makeOrder('paid'));
      outboxRepository.create.mockResolvedValue({} as OutboxMessage);

      const result = await service.markAsPaid(MERCHANT_ID, ORDER_CODE);

      expect(orderRepository.updateStatus).toHaveBeenCalledWith(expect.any(String), 'paid');
      expect(outboxRepository.create).toHaveBeenCalledTimes(1); // AC-15
      expect(result).toContain('✅');
    });

    it('should be idempotent if already paid', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('paid'));
      await service.markAsPaid(MERCHANT_ID, ORDER_CODE);
      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-09: enviado
  // ---------------------------------------------------------------------------
  describe('AC-09: markAsShipped()', () => {
    it('should transition confirmed → shipped', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('confirmed'));
      orderRepository.updateStatus.mockResolvedValue(makeOrder('shipped'));
      outboxRepository.create.mockResolvedValue({} as OutboxMessage);

      const result = await service.markAsShipped(MERCHANT_ID, ORDER_CODE);

      expect(orderRepository.updateStatus).toHaveBeenCalledWith(expect.any(String), 'shipped');
      expect(outboxRepository.create).toHaveBeenCalledTimes(1); // AC-15
      expect(result).toContain('✅');
    });

    it('should be idempotent if already shipped', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('shipped'));
      await service.markAsShipped(MERCHANT_ID, ORDER_CODE);
      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-10: pedido
  // ---------------------------------------------------------------------------
  describe('AC-10: getOrderDetails()', () => {
    it('should return formatted order details', async () => {
      orderRepository.findByOrderCodeWithItems.mockResolvedValue(
        makeOrderWithItems('confirmed') as unknown as OrderWithItems,
      );

      const result = await service.getOrderDetails(MERCHANT_ID, ORDER_CODE);

      expect(result).toContain(ORDER_CODE);
      expect(result).toContain(CUSTOMER_NAME);
      expect(result).toContain('Camiseta azul - Talla M');
    });

    it('should return error if order not found', async () => {
      orderRepository.findByOrderCodeWithItems.mockResolvedValue(null);
      const result = await service.getOrderDetails(MERCHANT_ID, ORDER_CODE);
      expect(result).toContain('❌');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-11: pendientes
  // ---------------------------------------------------------------------------
  describe('AC-11: listPendingOrders()', () => {
    it('should list pending orders', async () => {
      orderRepository.findPendingByMerchant.mockResolvedValue([
        makeOrder('pending_payment'),
        makeOrder('confirmed', 'ORD-002'),
      ]);

      const result = await service.listPendingOrders(MERCHANT_ID);

      expect(result).toContain('ORD-001');
      expect(result).toContain('ORD-002');
      expect(result).toContain('2');
    });

    it('should return empty message if no pending orders', async () => {
      orderRepository.findPendingByMerchant.mockResolvedValue([]);
      const result = await service.listPendingOrders(MERCHANT_ID);
      expect(result).toContain('ℹ️');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-12: hoy
  // ---------------------------------------------------------------------------
  describe('AC-12: getDailySummary()', () => {
    it('should return daily summary with count and total', async () => {
      orderRepository.getDailySummary.mockResolvedValue({ count: 3, total: 450000 });
      const result = await service.getDailySummary(MERCHANT_ID);
      expect(result).toContain('3');
      expect(result).toContain('450');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-13: ayuda
  // ---------------------------------------------------------------------------
  describe('AC-13: getHelpText()', () => {
    it('should list all available commands', () => {
      const help = service.getHelpText();
      expect(help).toContain('confirmar');
      expect(help).toContain('rechazar');
      expect(help).toContain('pagado');
      expect(help).toContain('enviado');
      expect(help).toContain('pedido');
      expect(help).toContain('pendientes');
      expect(help).toContain('hoy');
      expect(help).toContain('pausar bot');
      expect(help).toContain('activar bot');
      expect(help).toContain('ayuda');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-14: pausar bot / activar bot
  // ---------------------------------------------------------------------------
  describe('AC-14: pauseBot() / activateBot()', () => {
    it('should set botPaused = true', async () => {
      (prisma.merchant.update as jest.Mock).mockResolvedValue({});
      const result = await service.pauseBot(MERCHANT_ID);
      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: MERCHANT_ID },
        data: { botPaused: true },
      });
      expect(result).toContain('⏸️');
    });

    it('should set botPaused = false', async () => {
      (prisma.merchant.update as jest.Mock).mockResolvedValue({});
      const result = await service.activateBot(MERCHANT_ID);
      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: MERCHANT_ID },
        data: { botPaused: false },
      });
      expect(result).toContain('▶️');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-15: Customer notification on state transitions
  // ---------------------------------------------------------------------------
  describe('AC-15: customer notification via OutboxMessage', () => {
    it('confirmOrder should enqueue 1 OutboxMessage to customer phone', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('pending_payment'));
      orderRepository.updateStatus.mockResolvedValue(makeOrder('confirmed'));
      outboxRepository.create.mockResolvedValue({} as OutboxMessage);

      await service.confirmOrder(MERCHANT_ID, ORDER_CODE);

      expect(outboxRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          to: CUSTOMER_PHONE,
          payloadJson: expect.objectContaining({ text: expect.stringContaining(ORDER_CODE) }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-16: Invalid state transitions
  // ---------------------------------------------------------------------------
  describe('AC-16: invalid transitions are rejected without DB changes', () => {
    it('should reject transition cancelled → shipped', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('cancelled'));
      const result = await service.markAsShipped(MERCHANT_ID, ORDER_CODE);
      expect(result).toContain('❌');
      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
      expect(outboxRepository.create).not.toHaveBeenCalled();
    });

    it('should reject transition delivered → confirmed', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('delivered'));
      const result = await service.confirmOrder(MERCHANT_ID, ORDER_CODE);
      expect(result).toContain('❌');
      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('should reject transition pending_payment → shipped', async () => {
      orderRepository.findByOrderCode.mockResolvedValue(makeOrder('pending_payment'));
      const result = await service.markAsShipped(MERCHANT_ID, ORDER_CODE);
      expect(result).toContain('❌');
      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    });
  });
});
