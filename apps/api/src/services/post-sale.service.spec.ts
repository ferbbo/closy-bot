/**
 * PostSaleService Unit Tests
 * PR-07: AC-02, AC-03, AC-04, AC-05
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Test, TestingModule } from '@nestjs/testing';
import { PostSaleService } from './post-sale.service';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { PlaybookService } from './playbook.service';
import type { MerchantPlaybookData } from './playbook.service';

const mockMerchant: MerchantPlaybookData = {
  id: 'merchant-1',
  name: 'Test Store',
  industry: 'ropa',
  playbookConfig: null,
};

const mockOrder = {
  id: 'order-1',
  orderCode: 'ORD-001',
  status: 'confirmed',
  totalAmount: { toNumber: () => 120000 },
  shippingAddress: 'Calle 1 # 2-3',
  customerName: 'Juan Pérez',
  createdAt: new Date('2026-02-01'),
};

describe('PostSaleService', () => {
  let service: PostSaleService;
  let prisma: { order: any; ticket: any };
  let playbookService: jest.Mocked<Pick<PlaybookService, 'getMessage'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostSaleService,
        {
          provide: PrismaService,
          useValue: {
            order: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
            },
            ticket: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: PlaybookService,
          useValue: {
            getMessage: jest.fn((merchant: any, key: string, placeholders?: any) => {
              if (key === 'noOrderFound') return 'No encontré pedidos tuyos.';
              if (key === 'orderStatusTemplate')
                return `Tu pedido ${placeholders?.orderCode}: ${placeholders?.statusMessage}`;
              if (key === 'orderStatusConfirmed') return 'está confirmado y en preparación';
              if (key === 'orderStatusShipped') return `fue enviado. ${placeholders?.trackingInfo}`;
              return key;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PostSaleService>(PostSaleService);
    prisma = module.get<any>(PrismaService);
    playbookService = module.get<any>(PlaybookService);
  });

  // AC-02: should return last order for customer
  describe('AC-02: getOrderStatus — returns last order', () => {
    it('should return last order for customer when no orderCode provided', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(mockOrder);

      const result = await service.getOrderStatus('merchant-1', 'customer-1', mockMerchant);

      expect(result.found).toBe(true);
      expect(result.order?.orderCode).toBe('ORD-001');
      expect(result.order?.status).toBe('confirmed');
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: 'merchant-1', customerId: 'customer-1' } }),
      );
    });

    it('should include statusMessage in response via template', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(mockOrder);

      const result = await service.getOrderStatus('merchant-1', 'customer-1', mockMerchant);

      expect(result.message).toContain('ORD-001');
    });
  });

  // AC-03: should find order by orderCode
  describe('AC-03: getOrderStatus — find by orderCode', () => {
    it('should find order by specific orderCode', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(mockOrder);

      const result = await service.getOrderStatus(
        'merchant-1',
        'customer-1',
        mockMerchant,
        'ORD-001',
      );

      expect(result.found).toBe(true);
      expect(result.order?.orderCode).toBe('ORD-001');
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orderCode: expect.objectContaining({ equals: 'ORD-001' }),
          }),
        }),
      );
    });

    it('should return null result when orderCode not found', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getOrderStatus(
        'merchant-1',
        'customer-1',
        mockMerchant,
        'ORD-999',
      );

      expect(result.found).toBe(false);
      expect(result.message).toBe('No encontré pedidos tuyos.');
    });
  });

  // AC-04: should create ticket with status 'open'
  describe('AC-04: createTicket', () => {
    it('should create ticket with status open', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({ orderCode: 'ORD-001' });
      (prisma.ticket.create as jest.Mock).mockResolvedValue({ id: 'ticket-1' });

      const result = await service.createTicket(
        'order-1',
        'customer-1',
        'merchant-1',
        'damaged',
        'La caja llegó rota',
      );

      expect(result.ticketId).toBe('ticket-1');
      expect(result.orderCode).toBe('ORD-001');
      expect(result.type).toBe('damaged');
      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'open',
            type: 'damaged',
            description: 'La caja llegó rota',
          }),
        }),
      );
    });

    it('should throw if order not found', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createTicket('nonexistent', 'customer-1', 'merchant-1', 'other', 'test'),
      ).rejects.toThrow('Order nonexistent not found');
    });
  });

  // AC-05 (getStatusMessage): each status returns correct template key
  describe('AC-05: getStatusMessage per status', () => {
    it.each([
      ['pending_payment', 'orderStatusPendingPayment'],
      ['confirmed', 'orderStatusConfirmed'],
      ['paid', 'orderStatusPaid'],
      ['delivered', 'orderStatusDelivered'],
      ['cancelled', 'orderStatusCancelled'],
    ])('should call getMessage with %s → %s key', (status, expectedKey) => {
      service.getStatusMessage(mockMerchant, status, '');
      expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, expectedKey);
    });

    it('should pass trackingInfo placeholder for shipped status', () => {
      service.getStatusMessage(mockMerchant, 'shipped', 'TRK-999');
      expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'orderStatusShipped', {
        trackingInfo: 'TRK-999',
      });
    });
  });

  // detectTicketType keyword classification
  describe('detectTicketType', () => {
    it('should detect missing from "falta"', () => {
      expect(service.detectTicketType('falta algo en el pedido')).toBe('missing');
    });

    it('should detect damaged from "dañado"', () => {
      expect(service.detectTicketType('el producto llegó dañado')).toBe('damaged');
    });

    it('should detect delay from "demora"', () => {
      expect(service.detectTicketType('hay una demora en el pedido')).toBe('delay');
    });

    it('should return null for ambiguous text', () => {
      expect(service.detectTicketType('tengo un problema')).toBeNull();
    });
  });
});
