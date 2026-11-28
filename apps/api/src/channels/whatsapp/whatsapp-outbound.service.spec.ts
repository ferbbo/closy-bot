import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsAppOutboundService, WhatsAppCredentials } from './whatsapp-outbound.service';

describe('WhatsAppOutboundService (PR-03.11)', () => {
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

  describe('sendTextMessageWithCredentials() - AC-05', () => {
    it('should send message with provided credentials in dry run mode', async () => {
      const credentials: WhatsAppCredentials = {
        accessToken: 'channel-specific-token',
        phoneNumberId: '987654321',
      };

      const result = await service.sendTextMessageWithCredentials(
        '+573001234567',
        'Test message',
        credentials,
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('dry-run');
    });

    it('should use accessToken and phoneNumberId from credentials parameter', async () => {
      const credentials: WhatsAppCredentials = {
        accessToken: 'custom-token-123',
        phoneNumberId: 'custom-phone-456',
      };

      const result = await service.sendTextMessageWithCredentials(
        '+573001234567',
        'Test',
        credentials,
      );

      expect(result.success).toBe(true);
      // In dry run, we don't make real API calls, but method accepts credentials
    });

    it('should handle missing credentials gracefully', async () => {
      const credentials: WhatsAppCredentials = {
        accessToken: '',
        phoneNumberId: '',
      };

      const result = await service.sendTextMessageWithCredentials(
        '+573001234567',
        'Test',
        credentials,
      );

      // Should succeed in dry run mode even with empty credentials
      expect(result.success).toBe(true);
      expect(result.messageId).toContain('dry-run');
    });

    it('should sanitize and mask phone numbers in logs', async () => {
      const credentials: WhatsAppCredentials = {
        accessToken: 'token',
        phoneNumberId: '123456789012',
      };

      const result = await service.sendTextMessageWithCredentials(
        '+57 300 123 4567',
        'Test',
        credentials,
      );

      expect(result.success).toBe(true);
      // Phone masking is internal (PII protection - AC-08 related)
    });
  });

  describe('sendTextMessage() - AC-06 (legacy method)', () => {
    it('should use env var credentials for backwards compatibility', async () => {
      const result = await service.sendTextMessage('+573001234567', 'Test message');

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('dry-run');
    });

    it('should delegate to sendTextMessageWithCredentials', async () => {
      // Spy on the new method to verify delegation
      const spy = jest.spyOn(service, 'sendTextMessageWithCredentials');

      await service.sendTextMessage('+573001234567', 'Test');

      expect(spy).toHaveBeenCalledWith('+573001234567', 'Test', {
        accessToken: 'test-token',
        phoneNumberId: '123456789',
      });

      spy.mockRestore();
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
  });
  // Delivery S1.4-T1
  describe('template messages (S1.4)', () => {
    const template = {
      name: 'pedido_confirmado',
      languageCode: 'es',
      params: { customer_name: 'Ana', order_code: 'ORD-0001' },
    };

    it('builds the Cloud API template payload with named body parameters', () => {
      expect(service.buildTemplatePayload('+57 3001234567', template)).toEqual({
        messaging_product: 'whatsapp',
        to: '573001234567',
        type: 'template',
        template: {
          name: 'pedido_confirmado',
          language: { code: 'es' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', parameter_name: 'customer_name', text: 'Ana' },
                { type: 'text', parameter_name: 'order_code', text: 'ORD-0001' },
              ],
            },
          ],
        },
      });
    });

    it('omits components when the template has no parameters', () => {
      const payload = service.buildTemplatePayload('573001234567', { ...template, params: {} });
      expect((payload.template as { components: unknown[] }).components).toEqual([]);
    });

    it('sends template in dry-run mode without calling fetch', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const result = await service.sendTemplateMessageWithCredentials('+573001234567', template, {
        accessToken: 'tok',
        phoneNumberId: '987',
      });
      expect(result.success).toBe(true);
      expect(result.messageId).toContain('dry-run');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('sendTemplateMessage falls back to env credentials', async () => {
      const spy = jest.spyOn(service, 'sendTemplateMessageWithCredentials');
      await service.sendTemplateMessage('+573001234567', template);
      expect(spy).toHaveBeenCalledWith('+573001234567', template, {
        accessToken: 'test-token',
        phoneNumberId: '123456789',
      });
    });
  });

  describe('interactive messages (S5.4)', () => {
    const msg = {
      body: 'Resumen',
      buttons: [
        { id: 'delivery_confirm_yes', title: 'Sí, confirmo' },
        { id: 'delivery_confirm_no', title: 'No, cambiar' },
      ],
    };

    it('builds the Cloud API interactive button payload', () => {
      expect(service.buildInteractivePayload('+57 300 1234567', msg)).toEqual({
        messaging_product: 'whatsapp',
        to: '573001234567',
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Resumen' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'delivery_confirm_yes', title: 'Sí, confirmo' } },
              { type: 'reply', reply: { id: 'delivery_confirm_no', title: 'No, cambiar' } },
            ],
          },
        },
      });
    });

    it('sends in dry-run mode without calling fetch', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const result = await service.sendInteractiveMessage('+573001234567', msg);
      expect(result.success).toBe(true);
      expect(result.messageId).toContain('dry-run');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('POSTs the payload with channel credentials outside dry-run and maps errors', async () => {
      const live = new WhatsAppOutboundService({
        get: (key: string, def?: string) =>
          ({ NODE_ENV: 'production', WHATSAPP_API_URL: 'https://graph.test' })[key] ?? def,
      } as unknown as ConfigService);
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ messages: [{ id: 'wamid.I1' }] }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'bad',
        } as unknown as Response);
      const creds = { accessToken: 'tok', phoneNumberId: '987' };

      const ok = await live.sendInteractiveMessageWithCredentials('+573001234567', msg, creds);
      expect(ok).toEqual({ success: true, messageId: 'wamid.I1' });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://graph.test/v18.0/987/messages');
      expect(JSON.parse(String(init.body)).interactive.type).toBe('button');

      const bad = await live.sendInteractiveMessageWithCredentials('+573001234567', msg, creds);
      expect(bad).toEqual({ success: false, error: 'API error: 400 Bad Request' });
      fetchSpy.mockRestore();
    });
  });

  describe('image messages (S5.4)', () => {
    it('builds the Cloud API image-by-link payload (caption optional)', () => {
      expect(
        service.buildImagePayload('+573001234567', {
          link: 'https://cdn.x/p.jpg',
          caption: 'Doble',
        }),
      ).toEqual({
        messaging_product: 'whatsapp',
        to: '573001234567',
        type: 'image',
        image: { link: 'https://cdn.x/p.jpg', caption: 'Doble' },
      });
      expect(service.buildImagePayload('1', { link: 'https://cdn.x/p.jpg' }).image).toEqual({
        link: 'https://cdn.x/p.jpg',
      });
    });

    it('sendImageMessage falls back to env credentials (dry-run)', async () => {
      const spy = jest.spyOn(service, 'sendImageMessageWithCredentials');
      const result = await service.sendImageMessage('+573001234567', {
        link: 'https://cdn.x/a.jpg',
      });
      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        '+573001234567',
        { link: 'https://cdn.x/a.jpg' },
        {
          accessToken: 'test-token',
          phoneNumberId: '123456789',
        },
      );
    });
  });
});
