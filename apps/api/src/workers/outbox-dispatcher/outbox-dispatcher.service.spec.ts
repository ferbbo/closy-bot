import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxRepository } from '../../persistence/repositories/outbox.repository';
import { ChannelRepository } from '../../persistence/repositories/channel.repository'; // PR-03.11
import { WhatsAppOutboundService } from '../../channels/whatsapp/whatsapp-outbound.service';
import { OutboxMessageType, OutboxMessage, ChannelType } from '@prisma/client'; // PR-03.11: add ChannelType
import { MessageLogRepository } from '../../persistence/repositories/message-log.repository'; // PR-03.10

describe('OutboxDispatcherService', () => {
  let service: OutboxDispatcherService;
  let repository: jest.Mocked<OutboxRepository>;
  let channelRepo: jest.Mocked<ChannelRepository>; // PR-03.11
  let whatsappOutbound: jest.Mocked<WhatsAppOutboundService>;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxDispatcherService,
        {
          provide: OutboxRepository,
          useValue: {
            claimBatch: jest.fn(),
            markSent: jest.fn(),
            markFailed: jest.fn(),
          },
        },
        // PR-03.11: Add ChannelRepository mock
        {
          provide: ChannelRepository,
          useValue: {
            findById: jest.fn(),
            findByTypeAndExternalId: jest.fn(),
            findByMerchantId: jest.fn(),
          },
        },
        {
          provide: WhatsAppOutboundService,
          useValue: {
            sendTextMessage: jest.fn(),
            sendTextMessageWithCredentials: jest.fn(), // PR-03.11
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string | number | boolean) => {
              const config = {
                OUTBOX_BATCH_SIZE: 10,
                OUTBOX_LOCK_TTL_SECONDS: 300,
                OUTBOX_MAX_ATTEMPTS: 5,
                OUTBOX_DISPATCHER_ENABLED: 'true',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: MessageLogRepository,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'log-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<OutboxDispatcherService>(OutboxDispatcherService);
    repository = module.get(OutboxRepository);
    channelRepo = module.get(ChannelRepository); // PR-03.11
    whatsappOutbound = module.get(WhatsAppOutboundService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processOutbox', () => {
    it('should skip processing if already in progress', async () => {
      service['isProcessing'] = true;

      await service.processOutbox();

      expect(repository.claimBatch).not.toHaveBeenCalled();
    });

    it('should skip processing if dispatcher is disabled', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'OUTBOX_DISPATCHER_ENABLED') return 'false';
        return undefined;
      });

      // Re-create service with disabled config
      const module = await Test.createTestingModule({
        providers: [
          OutboxDispatcherService,
          { provide: OutboxRepository, useValue: repository },
          { provide: ChannelRepository, useValue: channelRepo }, // PR-03.11
          { provide: WhatsAppOutboundService, useValue: whatsappOutbound },
          { provide: ConfigService, useValue: configService },
          {
            provide: MessageLogRepository,
            useValue: {
              create: jest.fn().mockResolvedValue({ id: 'log-1' }),
            },
          },
        ],
      }).compile();

      const disabledService = module.get<OutboxDispatcherService>(OutboxDispatcherService);

      await disabledService.processOutbox();

      expect(repository.claimBatch).not.toHaveBeenCalled();
    });

    it('should process batch of messages', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          type: OutboxMessageType.SEND_TEXT,
          to: '+573001234567',
          payloadJson: { text: 'Hello' },
          attempts: 0,
        },
      ];

      repository.claimBatch.mockResolvedValue(mockMessages as OutboxMessage[]);
      whatsappOutbound.sendTextMessage.mockResolvedValue({
        success: true,
        messageId: 'whatsapp-123',
      });

      await service.processOutbox();

      expect(repository.claimBatch).toHaveBeenCalledWith(10, expect.any(String), 300, 5);
      expect(whatsappOutbound.sendTextMessage).toHaveBeenCalledWith('+573001234567', 'Hello');
      expect(repository.markSent).toHaveBeenCalledWith('msg-1', 'whatsapp-123');
    });

    it('should handle errors and mark as failed', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          type: OutboxMessageType.SEND_TEXT,
          to: '+573001234567',
          payloadJson: { text: 'Hello' },
          attempts: 0,
        },
      ];

      repository.claimBatch.mockResolvedValue(mockMessages as OutboxMessage[]);
      whatsappOutbound.sendTextMessage.mockResolvedValue({
        success: false,
        error: 'API error',
      });

      await service.processOutbox();

      expect(repository.markFailed).toHaveBeenCalledWith('msg-1', 'API error', 5);
      expect(repository.markSent).not.toHaveBeenCalled();
    });
  });

  describe('sendTextMessage', () => {
    it('should send message and mark as sent on success', async () => {
      const mockMessage = {
        id: 'msg-1',
        to: '+573001234567',
        payloadJson: { text: 'Test message' },
      };

      whatsappOutbound.sendTextMessage.mockResolvedValue({
        success: true,
        messageId: 'whatsapp-456',
      });

      await service['sendTextMessage'](mockMessage as OutboxMessage);

      expect(whatsappOutbound.sendTextMessage).toHaveBeenCalledWith(
        '+573001234567',
        'Test message',
      );
      expect(repository.markSent).toHaveBeenCalledWith('msg-1', 'whatsapp-456');
    });

    it('should throw error if send fails', async () => {
      const mockMessage = {
        id: 'msg-1',
        to: '+573001234567',
        payloadJson: { text: 'Test' },
      };

      whatsappOutbound.sendTextMessage.mockResolvedValue({
        success: false,
        error: 'Network timeout',
      });

      await expect(service['sendTextMessage'](mockMessage as OutboxMessage)).rejects.toThrow(
        'Network timeout',
      );
      expect(repository.markSent).not.toHaveBeenCalled();
    });

    // PR-03.11 AC-07: Dispatcher uses channel credentials + fallback
    it('AC-07: should use channel credentials when channelId is present', async () => {
      const mockChannel = {
        id: 'channel-1',
        merchantId: 'merchant-1',
        type: ChannelType.WHATSAPP,
        externalId: '123456789',
        displayName: 'Main WhatsApp',
        credentials: {
          businessAccountId: 'ba-123',
          phoneNumberId: '123456789',
          accessToken: 'token-from-channel',
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMessage = {
        id: 'msg-1',
        to: '+573001234567',
        channelId: 'channel-1',
        payloadJson: { text: 'Test with channel' },
      };

      channelRepo.findById.mockResolvedValue(mockChannel);
      whatsappOutbound.sendTextMessageWithCredentials.mockResolvedValue({
        success: true,
        messageId: 'whatsapp-ch-123',
      });

      await service['sendTextMessage'](mockMessage as OutboxMessage);

      expect(channelRepo.findById).toHaveBeenCalledWith('channel-1');
      expect(whatsappOutbound.sendTextMessageWithCredentials).toHaveBeenCalledWith(
        '+573001234567',
        'Test with channel',
        {
          businessAccountId: 'ba-123',
          phoneNumberId: '123456789',
          accessToken: 'token-from-channel',
        },
      );
      expect(repository.markSent).toHaveBeenCalledWith('msg-1', 'whatsapp-ch-123');
    });

    it('AC-07: should fallback to env vars if channelId is null (backwards compat)', async () => {
      const mockMessage = {
        id: 'msg-2',
        to: '+573001234567',
        channelId: null,
        payloadJson: { text: 'Legacy message' },
      };

      whatsappOutbound.sendTextMessage.mockResolvedValue({
        success: true,
        messageId: 'whatsapp-legacy-456',
      });

      await service['sendTextMessage'](mockMessage as OutboxMessage);

      expect(channelRepo.findById).not.toHaveBeenCalled();
      expect(whatsappOutbound.sendTextMessage).toHaveBeenCalledWith(
        '+573001234567',
        'Legacy message',
      );
      expect(repository.markSent).toHaveBeenCalledWith('msg-2', 'whatsapp-legacy-456');
    });

    it('AC-07: should fallback to env vars if channel not found (defensive)', async () => {
      const mockMessage = {
        id: 'msg-3',
        to: '+573001234567',
        channelId: 'non-existent-channel',
        payloadJson: { text: 'Orphaned message' },
      };

      channelRepo.findById.mockResolvedValue(null);
      whatsappOutbound.sendTextMessage.mockResolvedValue({
        success: true,
        messageId: 'whatsapp-fallback-789',
      });

      await service['sendTextMessage'](mockMessage as OutboxMessage);

      expect(channelRepo.findById).toHaveBeenCalledWith('non-existent-channel');
      expect(whatsappOutbound.sendTextMessage).toHaveBeenCalledWith(
        '+573001234567',
        'Orphaned message',
      );
      expect(repository.markSent).toHaveBeenCalledWith('msg-3', 'whatsapp-fallback-789');
    });
  });

  describe('handleError', () => {
    it('should mark message as failed with error details', async () => {
      const mockMessage = {
        id: 'msg-1',
        to: '+573001234567',
      };

      const error = new Error('Connection refused');

      await service['handleError'](mockMessage as OutboxMessage, error);

      expect(repository.markFailed).toHaveBeenCalledWith('msg-1', 'Connection refused', 5);
    });

    it('should handle non-Error objects', async () => {
      const mockMessage = {
        id: 'msg-1',
        to: '+573001234567',
      };

      await service['handleError'](mockMessage as OutboxMessage, 'String error');

      expect(repository.markFailed).toHaveBeenCalledWith('msg-1', 'String error', 5);
    });
  });
});
