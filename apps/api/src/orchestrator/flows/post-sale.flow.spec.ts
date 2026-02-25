/**
 * PostSaleFlow Unit Tests
 * PR-07: AC-05, AC-06, AC-07, AC-08, AC-09
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Test, TestingModule } from '@nestjs/testing';
import { PostSaleFlow } from './post-sale.flow';
import { PostSaleService } from '../../services/post-sale.service';
import { MerchantNotificationService } from '../../services/merchant-notification.service';
import { PlaybookService } from '../../services/playbook.service';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import type { MerchantPlaybookData } from '../../services/playbook.service';

const mockMerchant: MerchantPlaybookData = {
  id: 'merchant-1',
  name: 'Test Store',
  industry: 'ropa',
  playbookConfig: null,
};

describe('PostSaleFlow', () => {
  let flow: PostSaleFlow;
  let postSaleService: jest.Mocked<PostSaleService>;
  let merchantNotificationService: jest.Mocked<MerchantNotificationService>;
  let playbookService: jest.Mocked<Pick<PlaybookService, 'getMessage'>>;
  let prismaService: {
    conversation: any;
    order: any;
    customer: any;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostSaleFlow,
        {
          provide: PostSaleService,
          useValue: {
            getOrderStatus: jest.fn(),
            createTicket: jest.fn(),
            findOrderByCode: jest.fn(),
            detectTicketType: jest.fn(),
          },
        },
        {
          provide: MerchantNotificationService,
          useValue: {
            notifyTicketCreated: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PlaybookService,
          useValue: {
            getMessage: jest.fn((merchant: any, key: string, placeholders?: any) => {
              if (key === 'noOrderFound') return 'No encontré pedidos tuyos.';
              if (key === 'orderStatusTemplate')
                return `Tu pedido ${placeholders?.orderCode ?? 'ORD-001'}: ${placeholders?.statusMessage ?? ''}`;
              if (key === 'ticketTypePrompt')
                return '¿Qué tipo de problema? 1) Falta 2) Dañado 3) Retraso 4) Otro';
              if (key === 'ticketDescriptionPrompt') return 'Describe el problema:';
              if (key === 'ticketCreatedConfirm') return '✅ Tu reclamo fue registrado.';
              return key;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            conversation: {
              findUnique: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            order: {
              findFirst: jest.fn(),
            },
            customer: {
              findUnique: jest.fn().mockResolvedValue({ name: 'Juan', phone: '+573001234567' }),
            },
          },
        },
      ],
    }).compile();

    flow = module.get<PostSaleFlow>(PostSaleFlow);
    postSaleService = module.get<any>(PostSaleService);
    merchantNotificationService = module.get<any>(MerchantNotificationService);
    playbookService = module.get<any>(PlaybookService);
    prismaService = module.get<any>(PrismaService);
  });

  // Helper: set conversation state
  function withState(state: unknown) {
    (prismaService.conversation.findUnique as jest.Mock).mockResolvedValue({
      metadata: { post_sale: state },
    });
  }

  function withNoState() {
    (prismaService.conversation.findUnique as jest.Mock).mockResolvedValue({
      metadata: {},
    });
  }

  // AC-05: respond with status template for each OrderStatus value
  describe('AC-05: handleOrderStatus — respond with status template', () => {
    it('should respond with status template when order found', async () => {
      (postSaleService.getOrderStatus as jest.Mock).mockResolvedValue({
        found: true,
        order: { id: 'o1', orderCode: 'ORD-001', status: 'confirmed' },
        message: 'Tu pedido ORD-001: está confirmado y en preparación',
      });
      withNoState();

      const response = await flow.handleOrderStatus(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        '¿Cómo va mi pedido?',
      );

      expect(response).toContain('ORD-001');
    });
  });

  // AC-06: no orders found → noOrderFound message
  describe('AC-06: handleOrderStatus — no orders found', () => {
    it('should handle no orders found and save state', async () => {
      (postSaleService.getOrderStatus as jest.Mock).mockResolvedValue({
        found: false,
        message: 'No encontré pedidos tuyos.',
      });
      withNoState();

      const response = await flow.handleOrderStatus(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'estado de mi pedido',
      );

      expect(response).toBe('No encontré pedidos tuyos.');
      // State saved with ASK_ORDER_CODE_FOR_STATUS
      expect(prismaService.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              post_sale: expect.objectContaining({ step: 'ASK_ORDER_CODE_FOR_STATUS' }),
            }),
          }),
        }),
      );
    });
  });

  // AC-07: shipped order with tracking info
  describe('AC-07: shipped order includes tracking info', () => {
    it('should include tracking info in shipped message', async () => {
      (postSaleService.getOrderStatus as jest.Mock).mockResolvedValue({
        found: true,
        order: { id: 'o1', orderCode: 'ORD-002', status: 'shipped' },
        message: 'Tu pedido ORD-002: fue enviado. En camino',
      });
      withNoState();

      const response = await flow.handleOrderStatus(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'estado pedido',
      );

      expect(response).toContain('ORD-002');
    });
  });

  // AC-08: ticket type classification by keywords
  describe('AC-08: handleCreateTicket — classify ticket type by keywords', () => {
    it('should detect ticket type from keywords and skip type prompt', async () => {
      (postSaleService.detectTicketType as jest.Mock).mockReturnValue('damaged');
      (prismaService.order.findFirst as jest.Mock).mockResolvedValue({
        id: 'order-1',
        orderCode: 'ORD-001',
      });
      withNoState();

      const response = await flow.handleCreateTicket(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'mi pedido llegó dañado',
      );

      // Should skip ticketTypePrompt and go to description
      expect(response).toBe('Describe el problema:');
      expect(prismaService.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              post_sale: expect.objectContaining({
                step: 'ASK_TICKET_DESCRIPTION',
                ticketType: 'damaged',
              }),
            }),
          }),
        }),
      );
    });

    it('should show type prompt when type is ambiguous', async () => {
      (postSaleService.detectTicketType as jest.Mock).mockReturnValue(null);
      (prismaService.order.findFirst as jest.Mock).mockResolvedValue({
        id: 'order-1',
        orderCode: 'ORD-001',
      });
      withNoState();

      const response = await flow.handleCreateTicket(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'tengo un problema',
      );

      expect(response).toContain('1) Falta');
    });
  });

  // AC-09: merchant notified via MerchantNotificationService
  describe('AC-09: merchant notified after ticket creation', () => {
    it('should call notifyTicketCreated after creating ticket', async () => {
      const ticketDescState = {
        step: 'ASK_TICKET_DESCRIPTION',
        intent: 'CREATE_TICKET',
        orderId: 'order-1',
        orderCode: 'ORD-001',
        ticketType: 'damaged',
        startedAt: new Date().toISOString(),
      };
      withState(ticketDescState);

      (postSaleService.createTicket as jest.Mock).mockResolvedValue({
        ticketId: 'ticket-1',
        orderCode: 'ORD-001',
        type: 'damaged',
      });

      await flow.handle(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'La caja llegó completamente rota',
      );

      expect(merchantNotificationService.notifyTicketCreated).toHaveBeenCalledWith(
        'merchant-1',
        expect.objectContaining({
          orderCode: 'ORD-001',
          type: 'damaged',
        }),
      );
    });

    it('should return ticketCreatedConfirm after ticket created', async () => {
      const state = {
        step: 'ASK_TICKET_DESCRIPTION',
        intent: 'CREATE_TICKET',
        orderId: 'order-1',
        orderCode: 'ORD-001',
        ticketType: 'missing',
        startedAt: new Date().toISOString(),
      };
      withState(state);

      (postSaleService.createTicket as jest.Mock).mockResolvedValue({
        ticketId: 'ticket-2',
        orderCode: 'ORD-001',
        type: 'missing',
      });

      const response = await flow.handle(
        mockMerchant,
        'conv-1',
        'customer-1',
        'merchant-1',
        'Faltó un artículo',
      );

      expect(response).toContain('✅');
      expect(playbookService.getMessage).toHaveBeenCalledWith(
        mockMerchant,
        'ticketCreatedConfirm',
        expect.objectContaining({ ticketId: 'ticket-2' }),
      );
    });
  });

  // getActiveState
  describe('getActiveState', () => {
    it('should return null when no state in metadata', async () => {
      withNoState();
      const state = await flow.getActiveState('conv-1');
      expect(state).toBeNull();
    });

    it('should return state when active (non-COMPLETED)', async () => {
      withState({
        step: 'ASK_TICKET_TYPE',
        intent: 'CREATE_TICKET',
        startedAt: new Date().toISOString(),
      });
      const state = await flow.getActiveState('conv-1');
      expect(state?.step).toBe('ASK_TICKET_TYPE');
    });

    it('should return null when state is COMPLETED', async () => {
      withState({ step: 'COMPLETED', intent: 'ORDER_STATUS', startedAt: '' });
      const state = await flow.getActiveState('conv-1');
      expect(state).toBeNull();
    });
  });
});
