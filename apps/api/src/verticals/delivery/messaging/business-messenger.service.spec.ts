import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { DeliveryConfigService } from '../config/delivery-config.service';
import { OutboxService } from '../../../persistence/outbox/outbox.service';
import { FeatureFlagsService } from '../../../common/feature-flags/feature-flags.service';
import type { NotifyRequest } from '../contracts';
import { BusinessMessengerService } from './business-messenger.service';
import { CustomerServiceWindowService } from './customer-service-window.service';

describe('BusinessMessengerService (S1.4-T3) — decision matrix', () => {
  let prisma: {
    outboxMessage: { findUnique: jest.Mock; count: jest.Mock };
    merchantConfig: { findUnique: jest.Mock };
    conversation: { findUnique: jest.Mock; findFirst: jest.Mock };
    channel: { findFirst: jest.Mock };
    whatsappTemplateState: { findUnique: jest.Mock };
    merchant: { findUnique: jest.Mock };
  };
  let outbox: { enqueueWhatsAppTemplate: jest.Mock; enqueueWhatsAppText: jest.Mock };
  let window: { isOpen: jest.Mock };
  let flags: { isDeliveryEnabled: boolean };
  let service: BusinessMessengerService;

  const onTheWay: NotifyRequest = {
    merchantId: 'm-1',
    channelId: 'ch-1',
    to: '+573001234567',
    conversationId: 'conv-1',
    orderId: 'o-1',
    template: 'pedido_en_camino',
    params: { order_code: 'ORD-0042', merchant_name: 'Burger\nBarrio  ' },
    dedupeKey: 'order:o-1:status:on_the_way',
    freeText: 'Tu pedido ORD-0042 va en camino 🛵',
  };

  const setMode = (mode: 'auto' | 'template_always') =>
    prisma.merchantConfig.findUnique.mockResolvedValue({
      deliveryConfig: { notifications: { mode } },
    });

  beforeEach(() => {
    prisma = {
      outboxMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      merchantConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ optedOutAt: null }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      channel: { findFirst: jest.fn().mockResolvedValue({ id: 'ch-1' }) },
      whatsappTemplateState: {
        findUnique: jest.fn().mockResolvedValue({ status: 'APPROVED', category: 'UTILITY' }),
      },
      merchant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ name: 'Burger Barrio', whatsappNumber: '+573110000000' }),
      },
    };
    outbox = {
      enqueueWhatsAppTemplate: jest.fn().mockResolvedValue({ id: 'out-tpl' }),
      enqueueWhatsAppText: jest.fn().mockResolvedValue({ id: 'out-txt' }),
    };
    window = { isOpen: jest.fn().mockResolvedValue(false) };
    flags = { isDeliveryEnabled: true };
    service = new BusinessMessengerService(
      prisma as unknown as PrismaService,
      outbox as unknown as OutboxService,
      window as unknown as CustomerServiceWindowService,
      flags as unknown as FeatureFlagsService,
      new DeliveryConfigService(prisma as unknown as PrismaService),
    );
  });

  it('AC-34/AC-37 base: template_always → SEND_TEMPLATE with sanitized params and dedupeKey', async () => {
    window.isOpen.mockResolvedValue(true); // template_always ignores the window
    await expect(service.notify(onTheWay)).resolves.toEqual({
      status: 'queued',
      channel: 'template',
      outboxId: 'out-tpl',
    });
    expect(outbox.enqueueWhatsAppTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'pedido_en_camino',
        languageCode: 'es',
        params: { order_code: 'ORD-0042', merchant_name: 'Burger Barrio' },
        dedupeKey: 'order:o-1:status:on_the_way',
        channelId: 'ch-1',
        renderedText: 'Tu pedido ORD-0042 de Burger Barrio va en camino.',
      }),
    );
    expect(outbox.enqueueWhatsAppText).not.toHaveBeenCalled();
  });

  it('AC-34 mode=auto + window open → SEND_TEXT with freeText', async () => {
    setMode('auto');
    window.isOpen.mockResolvedValue(true);
    await expect(service.notify(onTheWay)).resolves.toEqual({
      status: 'queued',
      channel: 'text',
      outboxId: 'out-txt',
    });
    expect(outbox.enqueueWhatsAppText).toHaveBeenCalledWith(
      expect.objectContaining({ text: onTheWay.freeText, dedupeKey: onTheWay.dedupeKey }),
    );
  });

  it('AC-34 mode=auto + window closed → SEND_TEMPLATE', async () => {
    setMode('auto');
    await expect(service.notify(onTheWay)).resolves.toMatchObject({ channel: 'template' });
  });

  it('AC-37 comanda: window closed → comanda_nuevo_pedido with items on one line; auto+open → full ticket text', async () => {
    const comanda: NotifyRequest = {
      merchantId: 'm-1',
      channelId: 'ch-1',
      to: '+573110000000',
      orderId: 'o-2',
      template: 'comanda_nuevo_pedido',
      params: {
        order_code: 'ORD-0043',
        items: '2x Perro sencillo\n1x Gaseosa',
        fulfillment: 'Domicilio',
        address: 'Calle 45 # 30-12',
        payment: 'Efectivo',
        total: '$21.000',
      },
      dedupeKey: 'order:o-2:kitchen',
      freeText: '🧾 ORD-0043\n2x Perro sencillo\n1x Gaseosa\nTotal: $21.000',
    };
    await service.notify(comanda);
    expect(outbox.enqueueWhatsAppTemplate.mock.calls[0][0].params.items).toBe(
      '2x Perro sencillo 1x Gaseosa',
    );
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled(); // merchant audience: no opt-out

    setMode('auto');
    window.isOpen.mockResolvedValue(true);
    await service.notify({ ...comanda, dedupeKey: 'order:o-3:kitchen', orderId: 'o-3' });
    expect(outbox.enqueueWhatsAppText.mock.calls[0][0].text).toBe(comanda.freeText);
  });

  it('AC-35 opted-out customer → skipped OPTED_OUT, nothing enqueued', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ optedOutAt: new Date() });
    await expect(service.notify(onTheWay)).resolves.toEqual({
      status: 'skipped',
      reason: 'OPTED_OUT',
    });
    expect(outbox.enqueueWhatsAppTemplate).not.toHaveBeenCalled();
    expect(outbox.enqueueWhatsAppText).not.toHaveBeenCalled();
  });

  it('AC-35 opt-out resolved by phone when no conversationId', async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-x' });
    await expect(service.notify({ ...onTheWay, conversationId: null })).resolves.toMatchObject({
      reason: 'OPTED_OUT',
    });
  });

  it('AC-36 template recategorized to MARKETING + window closed → skipped TEMPLATE_NOT_USABLE + alerta_operacion', async () => {
    prisma.whatsappTemplateState.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.channelId_name_language.name === 'pedido_en_camino'
          ? { status: 'APPROVED', category: 'MARKETING' }
          : { status: 'APPROVED', category: 'UTILITY' },
      ),
    );
    await expect(service.notify(onTheWay)).resolves.toEqual({
      status: 'skipped',
      reason: 'TEMPLATE_NOT_USABLE',
    });
    expect(outbox.enqueueWhatsAppTemplate).toHaveBeenCalledTimes(1);
    expect(outbox.enqueueWhatsAppTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'alerta_operacion',
        to: '+573110000000',
        dedupeKey: 'alert:template_not_usable:ch-1:pedido_en_camino:APPROVED:MARKETING',
      }),
    );
  });

  it('AC-36 template not usable + window open → free text fallback + alert', async () => {
    window.isOpen.mockResolvedValue(true);
    prisma.whatsappTemplateState.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.channelId_name_language.name === 'pedido_en_camino'
          ? { status: 'PAUSED', category: 'UTILITY' }
          : null,
      ),
    );
    await expect(service.notify(onTheWay)).resolves.toMatchObject({
      status: 'queued',
      channel: 'text',
    });
    expect(outbox.enqueueWhatsAppText).toHaveBeenCalledWith(
      expect.objectContaining({ to: onTheWay.to, text: onTheWay.freeText }),
    );
  });

  it('RN-30 cap per order reached → skipped CAP_REACHED', async () => {
    prisma.outboxMessage.count.mockResolvedValue(6);
    await expect(service.notify(onTheWay)).resolves.toEqual({
      status: 'skipped',
      reason: 'CAP_REACHED',
    });
    expect(prisma.outboxMessage.count).toHaveBeenCalledWith({
      where: { merchantId: 'm-1', to: onTheWay.to, dedupeKey: { startsWith: 'order:o-1:' } },
    });
  });

  it('RN-30 cap honours configured maxBusinessInitiatedPerOrder', async () => {
    prisma.merchantConfig.findUnique.mockResolvedValue({
      deliveryConfig: { notifications: { maxBusinessInitiatedPerOrder: 2 } },
    });
    prisma.outboxMessage.count.mockResolvedValue(2);
    await expect(service.notify(onTheWay)).resolves.toMatchObject({ reason: 'CAP_REACHED' });
  });

  it('RN-15 duplicate dedupeKey → skipped DUPLICATE', async () => {
    prisma.outboxMessage.findUnique.mockResolvedValue({ id: 'out-old' });
    await expect(service.notify(onTheWay)).resolves.toEqual({
      status: 'skipped',
      reason: 'DUPLICATE',
    });
    expect(outbox.enqueueWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it('resolves the active WhatsApp channel when channelId is not provided', async () => {
    await service.notify({ ...onTheWay, channelId: null });
    expect(prisma.channel.findFirst).toHaveBeenCalled();
    expect(outbox.enqueueWhatsAppTemplate.mock.calls[0][0].channelId).toBe('ch-1');
  });

  it('flag off → skipped without touching the database', async () => {
    flags.isDeliveryEnabled = false;
    await expect(service.notify(onTheWay)).resolves.toMatchObject({ status: 'skipped' });
    expect(prisma.outboxMessage.findUnique).not.toHaveBeenCalled();
  });

  it('alertOperation skips when merchant has no whatsappNumber', async () => {
    prisma.merchant.findUnique.mockResolvedValue({ name: 'X', whatsappNumber: '' });
    await expect(
      service.alertOperation({ merchantId: 'm-1', alert: 'calidad baja', dedupeKey: 'k' }),
    ).resolves.toBeNull();
  });
});
