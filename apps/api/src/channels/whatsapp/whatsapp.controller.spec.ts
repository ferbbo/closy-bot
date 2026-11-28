import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';
import { ConversationOrchestrator } from '../../orchestrator/conversation.orchestrator';
import { MerchantResolverService } from '../../services/merchant-resolver.service';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { OutboxService } from '../../persistence/outbox/outbox.service';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MetaWebhookPayload } from './dto/meta-webhook.dto';
import { TemplateWebhookHandler } from '../../verticals/delivery/messaging/template-webhook.handler';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';

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
    receiver_phone_id: 'phone-id-test',
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
          provide: MerchantResolverService,
          useValue: {
            resolveFromPhone: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: OutboxService,
          useValue: mockOutboxService,
        },
        {
          provide: FeatureFlagsService,
          useValue: { isDeliveryEnabled: false },
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
  // Delivery S1.4-T4: webhooks de WABA (plantillas y calidad del número)
  describe('WABA fields (S1.4-T4)', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const meta: ArgumentMetadata = { type: 'body', metatype: MetaWebhookPayload };
    const waba = (field: string, value: Record<string, unknown>) => ({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-123', time: 1764300000, changes: [{ field, value }] }],
    });
    const statusUpdate = waba('message_template_status_update', {
      event: 'APPROVED',
      message_template_id: 123456789,
      message_template_name: 'pedido_en_camino',
      message_template_language: 'es',
      reason: 'NONE',
    });
    const categoryUpdate = waba('template_category_update', {
      message_template_id: 123456789,
      message_template_name: 'pedido_en_camino',
      message_template_language: 'es',
      previous_category: 'UTILITY',
      new_category: 'MARKETING',
    });
    const qualityUpdate = waba('phone_number_quality_update', {
      display_phone_number: '573001234567',
      event: 'FLAGGED',
      current_limit: 'TIER_1K',
      current_quality_rating: 'RED',
    });
    const buildController = (moduleRef: Partial<ModuleRef>) => {
      const orchestratorMock = { process: jest.fn() };
      const ctrl = new WhatsAppController(
        { processInboundMessage: jest.fn() } as unknown as WhatsAppService,
        {} as WhatsAppOutboundService,
        orchestratorMock as unknown as ConversationOrchestrator,
        { resolveByChannel: jest.fn() } as unknown as MerchantResolverService,
        { get: jest.fn(() => 'tok') } as unknown as ConfigService,
        { enqueueWhatsAppText: jest.fn() } as unknown as OutboxService,
        moduleRef as ModuleRef,
        { isDeliveryEnabled: false } as FeatureFlagsService,
      );
      return { ctrl, orchestratorMock };
    };

    it.each([
      ['message_template_status_update', statusUpdate],
      ['template_category_update', categoryUpdate],
      ['phone_number_quality_update', qualityUpdate],
    ])('global ValidationPipe accepts %s payloads', async (_f, body) => {
      await expect(pipe.transform(body, meta)).resolves.toBeInstanceOf(MetaWebhookPayload);
    });

    it('messages payloads keep strict validation (messaging_product required, unknown fields rejected)', async () => {
      const messages = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba-123',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [{ from: '57300', id: 'wamid.1', timestamp: '1', type: 'text' }],
                },
              },
            ],
          },
        ],
      };
      await expect(pipe.transform(messages, meta)).rejects.toBeInstanceOf(BadRequestException);
      const withUnknown = JSON.parse(JSON.stringify(messages));
      withUnknown.entry[0].changes[0].value.messaging_product = 'whatsapp';
      withUnknown.entry[0].changes[0].value.metadata = {
        display_phone_number: '1',
        phone_number_id: 'p',
      };
      await expect(pipe.transform(withUnknown, meta)).resolves.toBeDefined();
      withUnknown.entry[0].changes[0].value.hacker = true;
      await expect(pipe.transform(withUnknown, meta)).rejects.toBeInstanceOf(BadRequestException);
      // un campo WABA dentro de un payload de messages no relaja messaging_product
      const mixed = JSON.parse(JSON.stringify(messages));
      mixed.entry[0].changes[0].value.event = 'APPROVED';
      await expect(pipe.transform(mixed, meta)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('delegates WABA changes to TemplateWebhookHandler and returns 200 without orchestrating', async () => {
      const handler = { handle: jest.fn().mockResolvedValue(undefined) };
      const get = jest.fn().mockReturnValue(handler);
      const { ctrl, orchestratorMock } = buildController({ get } as Partial<ModuleRef>);

      const body = (await pipe.transform(categoryUpdate, meta)) as MetaWebhookPayload;
      await expect(ctrl.handleMetaWebhook(body, {} as never)).resolves.toEqual({ received: true });

      expect(get).toHaveBeenCalledWith(TemplateWebhookHandler, { strict: false });
      expect(handler.handle).toHaveBeenCalledWith(
        'waba-123',
        'template_category_update',
        expect.objectContaining({
          new_category: 'MARKETING',
          message_template_name: 'pedido_en_camino',
        }),
      );
      expect(orchestratorMock.process).not.toHaveBeenCalled();
    });

    it('is a no-op (200) when the handler is not registered (delivery off)', async () => {
      const get = jest.fn(() => {
        throw new Error('not found');
      });
      const { ctrl } = buildController({ get } as unknown as Partial<ModuleRef>);
      await expect(
        ctrl.handleMetaWebhook(statusUpdate as unknown as MetaWebhookPayload, {} as never),
      ).resolves.toEqual({ received: true });
    });

    it('swallows handler errors and still returns 200', async () => {
      const handler = { handle: jest.fn().mockRejectedValue(new Error('db down')) };
      const { ctrl } = buildController({ get: jest.fn().mockReturnValue(handler) });
      await expect(
        ctrl.handleMetaWebhook(qualityUpdate as unknown as MetaWebhookPayload, {} as never),
      ).resolves.toEqual({ received: true });
    });

    it('does not resolve the handler for plain messages/status payloads', async () => {
      const get = jest.fn();
      const { ctrl } = buildController({ get });
      await ctrl.handleMetaWebhook(
        { object: 'whatsapp_business_account', entry: [] } as unknown as MetaWebhookPayload,
        {} as never,
      );
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('media gating (S5.0-T1)', () => {
    const audioPayload = (): MetaWebhookPayload =>
      ({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba-123',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '1', phone_number_id: 'phone-id-test' },
                  messages: [
                    {
                      from: '573001234567',
                      id: 'wamid.AUD1',
                      timestamp: '1700000000',
                      type: 'audio',
                      audio: { id: 'aud_1', mime_type: 'audio/ogg' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }) as unknown as MetaWebhookPayload;

    const buildMediaController = (opts: {
      isDeliveryEnabled: boolean;
      industry: string | null;
    }) => {
      const whatsappService = { processInboundMessage: jest.fn() };
      const merchantResolver = {
        resolveByChannel: jest.fn().mockResolvedValue({
          merchant: { id: 'merchant-1', industry: opts.industry },
          channel: { id: 'channel-1' },
        }),
      };
      const orchestratorMock = { process: jest.fn().mockResolvedValue({ shouldSend: false }) };
      const ctrl = new WhatsAppController(
        whatsappService as unknown as WhatsAppService,
        {} as WhatsAppOutboundService,
        orchestratorMock as unknown as ConversationOrchestrator,
        merchantResolver as unknown as MerchantResolverService,
        { get: jest.fn(() => 'tok') } as unknown as ConfigService,
        { enqueueWhatsAppText: jest.fn() } as unknown as OutboxService,
        {} as ModuleRef,
        { isDeliveryEnabled: opts.isDeliveryEnabled } as FeatureFlagsService,
      );
      return { ctrl, whatsappService, orchestratorMock };
    };

    it('ignores audio for a non-restaurante merchant (legacy behavior preserved, RN-21)', async () => {
      const { ctrl, whatsappService, orchestratorMock } = buildMediaController({
        isDeliveryEnabled: true,
        industry: 'ropa',
      });
      await ctrl.handleMetaWebhook(audioPayload(), {} as never);
      expect(whatsappService.processInboundMessage).not.toHaveBeenCalled();
      expect(orchestratorMock.process).not.toHaveBeenCalled();
    });

    it('ignores audio when isDeliveryEnabled is false even for a restaurante merchant', async () => {
      const { ctrl, whatsappService } = buildMediaController({
        isDeliveryEnabled: false,
        industry: 'restaurante',
      });
      await ctrl.handleMetaWebhook(audioPayload(), {} as never);
      expect(whatsappService.processInboundMessage).not.toHaveBeenCalled();
    });

    it('processes audio and propagates media fields when the delivery vertical is eligible', async () => {
      const { ctrl, whatsappService, orchestratorMock } = buildMediaController({
        isDeliveryEnabled: true,
        industry: 'restaurante',
      });
      await ctrl.handleMetaWebhook(audioPayload(), {} as never);
      expect(whatsappService.processInboundMessage).toHaveBeenCalled();
      expect(orchestratorMock.process).toHaveBeenCalledWith(
        expect.objectContaining({ mediaType: 'audio', mediaId: 'aud_1', mimeType: 'audio/ogg' }),
      );
    });
    const buttonPayload = (): MetaWebhookPayload => {
      const p = audioPayload() as unknown as {
        entry: Array<{ changes: Array<{ value: { messages: Array<Record<string, unknown>> } }> }>;
      };
      p.entry[0].changes[0].value.messages = [
        {
          from: '573001234567',
          id: 'wamid.BTN1',
          timestamp: '1700000000',
          type: 'interactive',
          interactive: {
            type: 'button_reply',
            button_reply: { id: 'delivery_confirm_yes', title: 'Sí, confirmo' },
          },
        },
      ];
      return p as unknown as MetaWebhookPayload;
    };

    it('S5.4: ignores a button reply outside the delivery vertical (legacy unchanged)', async () => {
      const { ctrl, whatsappService } = buildMediaController({
        isDeliveryEnabled: false,
        industry: 'restaurante',
      });
      await ctrl.handleMetaWebhook(buttonPayload(), {} as never);
      expect(whatsappService.processInboundMessage).not.toHaveBeenCalled();
    });

    it('S5.4: routes a button reply as its title text when the delivery vertical is eligible', async () => {
      const { ctrl, orchestratorMock } = buildMediaController({
        isDeliveryEnabled: true,
        industry: 'restaurante',
      });
      await ctrl.handleMetaWebhook(buttonPayload(), {} as never);
      expect(orchestratorMock.process).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'wamid.BTN1', text: 'Sí, confirmo' }),
      );
    });
  });
});
