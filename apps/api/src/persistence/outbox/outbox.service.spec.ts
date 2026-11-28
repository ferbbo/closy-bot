import { Test, TestingModule } from '@nestjs/testing';
import { OutboxService } from './outbox.service';
import { OutboxRepository } from '../repositories/outbox.repository';
import {
  OutboxChannel,
  OutboxMessageType,
  OutboxMessageStatus,
  OutboxMessage,
} from '@prisma/client';

describe('OutboxService', () => {
  let service: OutboxService;
  let repository: jest.Mocked<OutboxRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        {
          provide: OutboxRepository,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
    repository = module.get(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueueWhatsAppText', () => {
    it('should enqueue a WhatsApp text message', async () => {
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Hello, world!',
      };

      const mockMessage = {
        id: 'outbox-1',
        merchantId: 'merchant-1',
        channel: OutboxChannel.WHATSAPP,
        type: OutboxMessageType.SEND_TEXT,
        to: '+573001234567',
        payloadJson: { text: 'Hello, world!' },
        dedupeKey: expect.any(String),
        status: OutboxMessageStatus.PENDING,
        attempts: 0,
        nextRetryAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        providerMessageId: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create.mockResolvedValue(mockMessage);

      const result = await service.enqueueWhatsAppText(params);

      expect(result).toEqual(mockMessage);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant: { connect: { id: 'merchant-1' } },
          channel: OutboxChannel.WHATSAPP,
          type: OutboxMessageType.SEND_TEXT,
          to: '+573001234567',
          payloadJson: {
            text: 'Hello, world!',
            replyToMessageId: undefined,
            metadata: undefined,
          },
          dedupeKey: expect.any(String),
        }),
      );
    });

    it('should use custom dedupeKey if provided', async () => {
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Hello',
        dedupeKey: 'custom-key',
      };

      const mockMessage = {
        id: 'outbox-1',
        dedupeKey: 'custom-key',
      };

      repository.create.mockResolvedValue(mockMessage as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dedupeKey: 'custom-key',
        }),
      );
    });

    it('should include replyToMessageId in payload if provided', async () => {
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Reply',
        replyToMessageId: 'msg-123',
      };

      repository.create.mockResolvedValue({} as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payloadJson: {
            text: 'Reply',
            replyToMessageId: 'msg-123',
            metadata: undefined,
          },
        }),
      );
    });

    it('should include metadata in payload if provided', async () => {
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Message with metadata',
        metadata: { orderId: '12345' },
      };

      repository.create.mockResolvedValue({} as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payloadJson: {
            text: 'Message with metadata',
            replyToMessageId: undefined,
            metadata: { orderId: '12345' },
          },
        }),
      );
    });

    it('should mask phone number in logs', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: 'Test',
      };

      repository.create.mockResolvedValue({} as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('***4567'));
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('+573001234567'));
    });

    it('should not include message text in INFO logs (AC-08 PII-safe)', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const debugSpy = jest.spyOn(service['logger'], 'debug');

      const longText = 'A'.repeat(100);
      const params = {
        merchantId: 'merchant-1',
        to: '+573001234567',
        text: longText,
      };

      repository.create.mockResolvedValue({} as OutboxMessage);

      await service.enqueueWhatsAppText(params);

      // AC-08: INFO level should show length, not text content
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('length=100 chars'));
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('AAAA'));

      // DEBUG level may include truncated text for development
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('A'.repeat(50) + '...'));
    });
  });
  // Delivery S1.4-T1
  describe('enqueueWhatsAppTemplate (S1.4)', () => {
    it('creates a SEND_TEMPLATE message with dedupeKey and channel', async () => {
      repository.create.mockResolvedValue({ id: 'outbox-t1' } as OutboxMessage);

      const result = await service.enqueueWhatsAppTemplate({
        merchantId: 'merchant-1',
        conversationId: 'conv-1',
        channelId: 'channel-1',
        to: '+573001234567',
        templateName: 'pedido_en_camino',
        languageCode: 'es',
        params: { order_code: 'ORD-0042', merchant_name: 'Burger Barrio' },
        dedupeKey: 'order:o1:status:on_the_way',
        renderedText: 'Tu pedido ORD-0042 de Burger Barrio va en camino.',
      });

      expect(result.id).toBe('outbox-t1');
      expect(repository.create).toHaveBeenCalledWith({
        merchant: { connect: { id: 'merchant-1' } },
        conversationId: 'conv-1',
        channel: OutboxChannel.WHATSAPP,
        type: OutboxMessageType.SEND_TEMPLATE,
        to: '+573001234567',
        payloadJson: {
          template: {
            name: 'pedido_en_camino',
            languageCode: 'es',
            params: { order_code: 'ORD-0042', merchant_name: 'Burger Barrio' },
          },
          renderedText: 'Tu pedido ORD-0042 de Burger Barrio va en camino.',
          metadata: undefined,
        },
        dedupeKey: 'order:o1:status:on_the_way',
        channelRef: { connect: { id: 'channel-1' } },
      });
    });

    it('omits channelRef when no channelId', async () => {
      repository.create.mockResolvedValue({ id: 'outbox-t2' } as OutboxMessage);
      await service.enqueueWhatsAppTemplate({
        merchantId: 'merchant-1',
        to: '+573001234567',
        templateName: 'alerta_operacion',
        languageCode: 'es',
        params: {},
        dedupeKey: 'k',
      });
      expect(repository.create.mock.calls[0][0]).not.toHaveProperty('channelRef');
    });
  });

  describe('enqueueWhatsAppInteractive (S5.4)', () => {
    const buttons = [
      { id: 'delivery_confirm_yes', title: 'Sí, confirmo' },
      { id: 'delivery_confirm_no', title: 'No, cambiar' },
    ];

    it('creates a SEND_INTERACTIVE message with dedupeKey and channel', async () => {
      repository.create.mockResolvedValue({ id: 'outbox-i1' } as OutboxMessage);
      const result = await service.enqueueWhatsAppInteractive({
        merchantId: 'merchant-1',
        conversationId: 'conv-1',
        channelId: 'channel-1',
        to: '+573001234567',
        body: 'Resumen del pedido',
        buttons,
        dedupeKey: 'reply:wamid.1',
      });
      expect(result.id).toBe('outbox-i1');
      expect(repository.create).toHaveBeenCalledWith({
        merchant: { connect: { id: 'merchant-1' } },
        conversationId: 'conv-1',
        channel: OutboxChannel.WHATSAPP,
        type: OutboxMessageType.SEND_INTERACTIVE,
        to: '+573001234567',
        payloadJson: { interactive: { body: 'Resumen del pedido', buttons }, metadata: undefined },
        dedupeKey: 'reply:wamid.1',
        channelRef: { connect: { id: 'channel-1' } },
      });
    });

    it('omits channelRef when no channelId', async () => {
      repository.create.mockResolvedValue({ id: 'outbox-i2' } as OutboxMessage);
      await service.enqueueWhatsAppInteractive({
        merchantId: 'merchant-1',
        to: '+573001234567',
        body: 'x',
        buttons,
        dedupeKey: 'k',
      });
      expect(repository.create.mock.calls[0][0]).not.toHaveProperty('channelRef');
    });
  });
});
