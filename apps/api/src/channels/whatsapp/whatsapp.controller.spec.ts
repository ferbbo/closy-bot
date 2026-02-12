import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { InboundMessageDto } from './dto/inbound-message.dto';

describe('WhatsAppController', () => {
  let controller: WhatsAppController;
  let service: jest.Mocked<WhatsAppService>;

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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsAppController],
      providers: [
        {
          provide: WhatsAppService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<WhatsAppController>(WhatsAppController);
    service = module.get(WhatsAppService);
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
    });

    it('should re-throw non-conflict exceptions', async () => {
      const genericError = new Error('Database error');
      service.processInboundMessage.mockRejectedValue(genericError);

      await expect(controller.handleInbound(validDto)).rejects.toThrow('Database error');
    });
  });
});
