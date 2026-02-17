import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';
import { ConversationOrchestrator } from '../../orchestrator/conversation.orchestrator';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { OutboxService } from '../../persistence/outbox/outbox.service';

describe('WhatsAppController', () => {
  let controller: WhatsAppController;
  let service: jest.Mocked<WhatsAppService>;
  let outboundService: jest.Mocked<WhatsAppOutboundService>;
  let orchestrator: jest.Mocked<ConversationOrchestrator>;
  let outboxService: jest.Mocked<OutboxService>;

  const validDto: InboundMessageDto = {
    message_id: 'wamid.test123',
    from: '1234567890',
    timestamp: '2026-02-11T10:00:00Z',
    text: 'Hello',
  };

  beforeEach(async () => {
    const mockService = {
      processInboundMessage: jest.fn(),
    };

    const mockOutboundService = {
      sendTextMessage: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'msg-out-123',
      }),
    };

    const mockOrchestrator = {
      process: jest.fn().mockResolvedValue({
        response: 'Bot response',
        shouldSend: true,
        merchantId: 'merchant-123',
        intent: 'GREETING',
      }),
    };

    const mockOutboxService = {
      enqueueWhatsAppText: jest.fn().mockResolvedValue({
        id: 'outbox-123',
        status: 'PENDING',
      }),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'WHATSAPP_WEBHOOK_VERIFY_TOKEN') return 'test-token';
        if (key === 'WHATSAPP_APP_SECRET') return 'test-secret';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsAppController],
      providers: [
        {
          provide: WhatsAppService,
          useValue: mockService,
        },
        {
          provide: WhatsAppOutboundService,
          useValue: mockOutboundService,
        },
        {
          provide: ConversationOrchestrator,
          useValue: mockOrchestrator,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: OutboxService,
          useValue: mockOutboxService,
        },
        MetaSignatureGuard,
      ],
    }).compile();

    controller = module.get<WhatsAppController>(WhatsAppController);
    service = module.get(WhatsAppService);
    outboundService = module.get(WhatsAppOutboundService);
    orchestrator = module.get(ConversationOrchestrator);
    outboxService = module.get(OutboxService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleInbound', () => {
    it('should return processed=true for new message', async () => {
      service.processInboundMessage.mockResolvedValue({
        messageId: 'wamid.test123',
        channel: 'whatsapp',
        userExternalId: '1234567890',
        timestamp: new Date('2026-02-11T10:00:00Z'),
        text: 'Hello',
      });

      const result = await controller.handleInbound(validDto);

      expect(result).toEqual({
        processed: true,
      });
      expect(service.processInboundMessage).toHaveBeenCalledWith(validDto);
      expect(orchestrator.process).toHaveBeenCalled();
      expect(outboxService.enqueueWhatsAppText).toHaveBeenCalledWith({
        merchantId: 'merchant-123',
        to: '1234567890',
        text: 'Bot response',
        dedupeKey: 'legacy-reply:wamid.test123',
      });
    });

    it('should return processed=false with duplicate flag for duplicate message', async () => {
      service.processInboundMessage.mockRejectedValue(
        new ConflictException('Duplicate message_id'),
      );

      const result = await controller.handleInbound(validDto);

      expect(result).toEqual({
        processed: false,
        duplicate: true,
      });
      // Should not call orchestrator or outbound on duplicate
      expect(orchestrator.process).not.toHaveBeenCalled();
      expect(outboundService.sendTextMessage).not.toHaveBeenCalled();
    });

    it('should re-throw non-conflict exceptions', async () => {
      const genericError = new Error('Database error');
      service.processInboundMessage.mockRejectedValue(genericError);

      await expect(controller.handleInbound(validDto)).rejects.toThrow('Database error');
    });

    it('should not send response when shouldSend is false', async () => {
      service.processInboundMessage.mockResolvedValue({
        messageId: 'wamid.test123',
        channel: 'whatsapp',
        userExternalId: '1234567890',
        timestamp: new Date('2026-02-11T10:00:00Z'),
        text: 'Hello',
      });

      orchestrator.process.mockResolvedValue({
        response: 'Response',
        shouldSend: false,
        conversationId: 'conv-123',
        merchantId: 'merchant-123',
        intent: 'UNKNOWN',
      });

      const result = await controller.handleInbound(validDto);

      expect(result.processed).toBe(true);
      expect(outboxService.enqueueWhatsAppText).not.toHaveBeenCalled();
    });

    it('should throw when orchestrator fails after message persistence (legacy behavior)', async () => {
      service.processInboundMessage.mockResolvedValue({
        messageId: 'wamid.test123',
        channel: 'whatsapp',
        userExternalId: '1234567890',
        timestamp: new Date('2026-02-11T10:00:00Z'),
        text: 'Hello',
      });

      orchestrator.process.mockRejectedValue(new Error('Merchant not found'));

      // Legacy endpoint propagates orchestrator errors
      await expect(controller.handleInbound(validDto)).rejects.toThrow('Merchant not found');

      expect(service.processInboundMessage).toHaveBeenCalledWith(validDto);
      expect(orchestrator.process).toHaveBeenCalled();
      expect(outboxService.enqueueWhatsAppText).not.toHaveBeenCalled();
    });
  });
});
