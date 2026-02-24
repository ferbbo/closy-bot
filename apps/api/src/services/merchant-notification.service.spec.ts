/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PR-05: MerchantNotificationService unit tests
 * AC-11: Enqueue notification to merchant with order details
 */

import { Test, TestingModule } from '@nestjs/testing';
import { MerchantNotificationService } from './merchant-notification.service';
import { OutboxRepository } from '../persistence/repositories/outbox.repository';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { OutboxChannel, OutboxMessageType } from '@prisma/client';

describe('MerchantNotificationService', () => {
  let service: MerchantNotificationService;
  let outboxRepository: jest.Mocked<OutboxRepository>;
  let prismaService: jest.Mocked<PrismaService>;

  const mockPayload = {
    type: 'NEW_ORDER' as const,
    orderCode: 'ORD-001',
    customerName: 'Juan Pérez',
    totalAmount: '$120,000 COP',
    items: [{ name: 'Camiseta Azul - Talla M', qty: 2, price: '$60,000 COP' }],
    shippingAddress: 'Calle 123 #45-67, Bogotá',
    paymentMethod: 'Contraentrega',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantNotificationService,
        {
          provide: OutboxRepository,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            merchant: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<MerchantNotificationService>(MerchantNotificationService);
    outboxRepository = module.get(OutboxRepository);
    prismaService = module.get(PrismaService);
  });

  // ---------------------------------------------------------------------------
  // AC-11: Enqueue notification with order details
  // ---------------------------------------------------------------------------

  describe('AC-11: notifyNewOrder', () => {
    it('AC-11: should enqueue notification to merchant with order details', async () => {
      (prismaService.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merch-1',
        whatsappNumber: '+573009876543',
      });
      outboxRepository.create.mockResolvedValue({} as any);

      await service.notifyNewOrder('merch-1', mockPayload);

      expect(outboxRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant: { connect: { id: 'merch-1' } },
          channel: OutboxChannel.WHATSAPP,
          type: OutboxMessageType.SEND_TEXT,
          to: '+573009876543',
          dedupeKey: 'new-order-ORD-001-merch-1',
          payloadJson: expect.objectContaining({
            text: expect.stringContaining('ORD-001'),
          }),
        }),
      );
    });

    it('should format notification message correctly', () => {
      const message = service.formatMessage(mockPayload);

      expect(message).toContain('🔔 Nuevo pedido ORD-001');
      expect(message).toContain('Juan Pérez');
      expect(message).toContain('Calle 123 #45-67, Bogotá');
      expect(message).toContain('$120,000 COP');
      expect(message).toContain('Contraentrega');
      expect(message).toContain('Camiseta Azul - Talla M');
    });

    it('should skip notification if merchant.whatsappNumber is null', async () => {
      (prismaService.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merch-1',
        whatsappNumber: null,
      });

      await service.notifyNewOrder('merch-1', mockPayload);

      expect(outboxRepository.create).not.toHaveBeenCalled();
    });

    it('should skip notification if merchant not found', async () => {
      (prismaService.merchant.findUnique as jest.Mock).mockResolvedValue(null);

      await service.notifyNewOrder('merch-1', mockPayload);

      expect(outboxRepository.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // formatAmount
  // ---------------------------------------------------------------------------

  describe('formatAmount', () => {
    it('should format amount with currency', () => {
      const formatted = service.formatAmount(120000);
      expect(formatted).toContain('120');
      expect(formatted).toContain('COP');
    });
  });
});
