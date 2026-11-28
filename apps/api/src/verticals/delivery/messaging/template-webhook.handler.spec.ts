import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';
import { BusinessMessengerService } from './business-messenger.service';
import { TemplateWebhookHandler, isWabaWebhookField } from './template-webhook.handler';

describe('TemplateWebhookHandler (S1.4-T4, RN-31)', () => {
  let prisma: { channel: { findMany: jest.Mock }; whatsappTemplateState: { upsert: jest.Mock } };
  let messenger: { alertOperation: jest.Mock };
  let flags: { isDeliveryEnabled: boolean };
  let handler: TemplateWebhookHandler;

  beforeEach(() => {
    prisma = {
      channel: { findMany: jest.fn().mockResolvedValue([{ id: 'ch-1', merchantId: 'm-1' }]) },
      whatsappTemplateState: { upsert: jest.fn().mockResolvedValue({}) },
    };
    messenger = { alertOperation: jest.fn().mockResolvedValue(null) };
    flags = { isDeliveryEnabled: true };
    handler = new TemplateWebhookHandler(
      prisma as unknown as PrismaService,
      flags as unknown as FeatureFlagsService,
      messenger as unknown as BusinessMessengerService,
    );
  });

  it('message_template_status_update upserts status', async () => {
    await handler.handle('waba-1', 'message_template_status_update', {
      event: 'APPROVED',
      message_template_name: 'pedido_confirmado',
      message_template_language: 'es',
    });
    expect(prisma.whatsappTemplateState.upsert).toHaveBeenCalledWith({
      where: {
        channelId_name_language: { channelId: 'ch-1', name: 'pedido_confirmado', language: 'es' },
      },
      update: { status: 'APPROVED' },
      create: {
        channelId: 'ch-1',
        name: 'pedido_confirmado',
        language: 'es',
        status: 'APPROVED',
        category: 'UTILITY',
      },
    });
    expect(messenger.alertOperation).not.toHaveBeenCalled();
    const where = prisma.channel.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ wabaId: 'waba-1' }]));
  });

  it('AC-36 template_category_update → MARKETING upserts category and emits alerta_operacion (stable dedupeKey)', async () => {
    await handler.handle('waba-1', 'template_category_update', {
      message_template_name: 'pedido_en_camino',
      message_template_language: 'es',
      previous_category: 'UTILITY',
      new_category: 'MARKETING',
    });
    expect(prisma.whatsappTemplateState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { category: 'MARKETING' },
        create: expect.objectContaining({ status: 'APPROVED', category: 'MARKETING' }),
      }),
    );
    expect(messenger.alertOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'm-1',
        channelId: 'ch-1',
        dedupeKey: 'alert:template_category:ch-1:pedido_en_camino:es:MARKETING',
      }),
    );
  });

  it('category back to UTILITY does not alert', async () => {
    await handler.handle('waba-1', 'template_category_update', {
      message_template_name: 'pedido_en_camino',
      message_template_language: 'es',
      new_category: 'UTILITY',
    });
    expect(messenger.alertOperation).not.toHaveBeenCalled();
  });

  it('phone_number_quality_update FLAGGED → alert; UPGRADE → no alert', async () => {
    await handler.handle('waba-1', 'phone_number_quality_update', {
      display_phone_number: '573001234567',
      event: 'FLAGGED',
      current_limit: 'TIER_1K',
    });
    expect(messenger.alertOperation).toHaveBeenCalledTimes(1);
    expect(messenger.alertOperation.mock.calls[0][0].dedupeKey).toMatch(
      /^alert:phone_quality:ch-1:FLAGGED:\d{4}-\d{2}-\d{2}$/,
    );

    messenger.alertOperation.mockClear();
    await handler.handle('waba-1', 'phone_number_quality_update', { event: 'UPGRADE' });
    expect(messenger.alertOperation).not.toHaveBeenCalled();
  });

  it('flag off → no-op without touching the database', async () => {
    flags.isDeliveryEnabled = false;
    await handler.handle('waba-1', 'template_category_update', {
      message_template_name: 'pedido_en_camino',
      message_template_language: 'es',
      new_category: 'MARKETING',
    });
    expect(prisma.channel.findMany).not.toHaveBeenCalled();
    expect(prisma.whatsappTemplateState.upsert).not.toHaveBeenCalled();
  });

  it('unknown WABA / missing template name → no upsert', async () => {
    prisma.channel.findMany.mockResolvedValueOnce([]);
    await handler.handle('waba-x', 'message_template_status_update', {
      event: 'APPROVED',
      message_template_name: 'pedido_confirmado',
      message_template_language: 'es',
    });
    await handler.handle('waba-1', 'message_template_status_update', { event: 'APPROVED' });
    expect(prisma.whatsappTemplateState.upsert).not.toHaveBeenCalled();
  });

  it('isWabaWebhookField', () => {
    expect(isWabaWebhookField('template_category_update')).toBe(true);
    expect(isWabaWebhookField('messages')).toBe(false);
  });
});
