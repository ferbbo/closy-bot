import { mapMetaWebhookToInboundMessages, isStatusOnlyPayload } from './whatsapp-webhook.mapper';
import { MetaWebhookPayload } from './dto/meta-webhook.dto';

describe('whatsapp-webhook.mapper', () => {
  describe('mapMetaWebhookToInboundMessages', () => {
    it('should map text message correctly', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.ABC123',
                      timestamp: '1234567890',
                      type: 'text',
                      text: {
                        body: 'Hola, quiero comprar',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = mapMetaWebhookToInboundMessages(payload);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        message_id: 'wamid.ABC123',
        from: '+573001234567',
        receiver_phone_id: 'phone_123',
        timestamp: new Date(1234567890 * 1000).toISOString(),
        text: 'Hola, quiero comprar',
      });
    });

    it('should handle multiple messages', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.MSG1',
                      timestamp: '1234567890',
                      type: 'text',
                      text: { body: 'Message 1' },
                    },
                    {
                      from: '+573001234567',
                      id: 'wamid.MSG2',
                      timestamp: '1234567891',
                      type: 'text',
                      text: { body: 'Message 2' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = mapMetaWebhookToInboundMessages(payload);

      expect(result).toHaveLength(2);
      expect(result[0].message_id).toBe('wamid.MSG1');
      expect(result[1].message_id).toBe('wamid.MSG2');
    });

    it('should skip unsupported message types (sticker)', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.STK1',
                      timestamp: '1234567890',
                      type: 'sticker',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = mapMetaWebhookToInboundMessages(payload);

      expect(result).toHaveLength(0);
    });

    it('S5.0-T1: maps an image message with media fields (no text)', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.IMG1',
                      timestamp: '1234567890',
                      type: 'image',
                      image: {
                        id: 'img_123',
                        mime_type: 'image/jpeg',
                        caption: 'esto es un combo?',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = mapMetaWebhookToInboundMessages(payload);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        message_id: 'wamid.IMG1',
        media_type: 'image',
        media_id: 'img_123',
        mime_type: 'image/jpeg',
        caption: 'esto es un combo?',
      });
      expect(result[0].text).toBeUndefined();
    });

    it('S5.0-T1: maps an audio message with media fields and no caption', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.AUD1',
                      timestamp: '1234567890',
                      type: 'audio',
                      audio: { id: 'aud_123', mime_type: 'audio/ogg' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = mapMetaWebhookToInboundMessages(payload);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        message_id: 'wamid.AUD1',
        media_type: 'audio',
        media_id: 'aud_123',
        mime_type: 'audio/ogg',
      });
      expect(result[0].caption).toBeUndefined();
    });

    it('should skip messages without text body', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.EMPTY',
                      timestamp: '1234567890',
                      type: 'text',
                      // text field missing - casting to MetaMessage
                    } as unknown,
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = mapMetaWebhookToInboundMessages(payload);

      expect(result).toHaveLength(0);
    });

    it('should skip status updates', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  statuses: [
                    {
                      id: 'wamid.STATUS1',
                      status: 'delivered',
                      timestamp: '1234567890',
                      recipient_id: '+573001234567',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = mapMetaWebhookToInboundMessages(payload);

      expect(result).toHaveLength(0);
    });

    it('should handle empty payload', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [],
      };

      const result = mapMetaWebhookToInboundMessages(payload);

      expect(result).toHaveLength(0);
    });
  });

  describe('interactive button_reply (S5.4)', () => {
    const payloadWith = (message: Record<string, unknown>) =>
      ({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '1', phone_number_id: 'phone_123' },
                  messages: [
                    { from: '573001234567', id: 'wamid.B1', timestamp: '1700000000', ...message },
                  ],
                },
              },
            ],
          },
        ],
      }) as unknown as MetaWebhookPayload;

    it('maps button_reply to text = title plus interactive_reply_id', () => {
      const [dto] = mapMetaWebhookToInboundMessages(
        payloadWith({
          type: 'interactive',
          interactive: {
            type: 'button_reply',
            button_reply: { id: 'delivery_confirm_yes', title: 'Sí, confirmo' },
          },
        }),
      );
      expect(dto).toMatchObject({
        message_id: 'wamid.B1',
        text: 'Sí, confirmo',
        interactive_reply_id: 'delivery_confirm_yes',
        receiver_phone_id: 'phone_123',
      });
    });

    it('skips interactive messages without a button_reply', () => {
      const result = mapMetaWebhookToInboundMessages(
        payloadWith({ type: 'interactive', interactive: { type: 'nfm_reply' } }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('isStatusOnlyPayload', () => {
    it('should return true for status-only payload', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  statuses: [
                    {
                      id: 'wamid.STATUS1',
                      status: 'read',
                      timestamp: '1234567890',
                      recipient_id: '+573001234567',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = isStatusOnlyPayload(payload);

      expect(result).toBe(true);
    });

    it('should return false when messages are present', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.MSG1',
                      timestamp: '1234567890',
                      type: 'text',
                      text: { body: 'Hello' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = isStatusOnlyPayload(payload);

      expect(result).toBe(false);
    });

    it('should return true for empty payload', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [],
      };

      const result = isStatusOnlyPayload(payload);

      expect(result).toBe(true);
    });

    it('should return false when mixed statuses and messages', () => {
      const payload: MetaWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone_123',
                  },
                  messages: [
                    {
                      from: '+573001234567',
                      id: 'wamid.MSG1',
                      timestamp: '1234567890',
                      type: 'text',
                      text: { body: 'Hello' },
                    },
                  ],
                  statuses: [
                    {
                      id: 'wamid.STATUS1',
                      status: 'sent',
                      timestamp: '1234567889',
                      recipient_id: '+573001234567',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = isStatusOnlyPayload(payload);

      expect(result).toBe(false);
    });
  });
});
