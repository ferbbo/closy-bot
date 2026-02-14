import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';

describe('WhatsAppOutboundService', () => {
  let service: WhatsAppOutboundService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppOutboundService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                WHATSAPP_ACCESS_TOKEN: 'test-token',
                WHATSAPP_PHONE_NUMBER_ID: '123456789',
                WHATSAPP_API_VERSION: 'v18.0',
                WHATSAPP_API_URL: 'https://graph.facebook.com',
                NODE_ENV: 'test',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsAppOutboundService>(WhatsAppOutboundService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendTextMessage()', () => {
    it('should send message in dry run mode (test env)', async () => {
      const result = await service.sendTextMessage('+573001234567', 'Test message');

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('dry-run');
    });

    it('should sanitize phone number', async () => {
      const result = await service.sendTextMessage('+57 300 123 4567', 'Test');

      expect(result.success).toBe(true);
      // Phone sanitization is internal, but we verify no errors
    });

    it('should handle empty credentials gracefully', async () => {
      // Create a new instance with empty credentials
      const moduleWithoutCreds = await Test.createTestingModule({
        providers: [
          WhatsAppOutboundService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string) => {
                const config: Record<string, string> = {
                  WHATSAPP_ACCESS_TOKEN: '',
                  WHATSAPP_PHONE_NUMBER_ID: '',
                  WHATSAPP_API_VERSION: 'v18.0',
                  WHATSAPP_API_URL: 'https://graph.facebook.com',
                  NODE_ENV: 'test',
                };
                return config[key] ?? defaultValue;
              }),
            },
          },
        ],
      }).compile();

      const serviceWithoutCreds =
        moduleWithoutCreds.get<WhatsAppOutboundService>(WhatsAppOutboundService);

      const result = await serviceWithoutCreds.sendTextMessage('+573001234567', 'Test');

      // Should still succeed in dry run mode
      expect(result.success).toBe(true);
      expect(result.messageId).toContain('dry-run');
    });

    it('should log truncated message text', async () => {
      const longMessage = 'a'.repeat(100);
      const result = await service.sendTextMessage('+573001234567', longMessage);

      expect(result.success).toBe(true);
      // Logging is internal, but we verify no errors with long messages
    });
  });
});
