import type { PrismaService } from '../../../persistence/prisma/prisma.service';
import type { KitchenTicket, OrderSink } from '../contracts';
import type { BusinessMessengerService } from '../messaging/business-messenger.service';
import { KitchenTicketPresenter } from '../presenters/kitchen-ticket.presenter';
import { OrderSinkRunner, WhatsAppKitchenSink } from './whatsapp-kitchen.sink';

const ticket: KitchenTicket = {
  orderId: 'o1',
  orderCode: 'ORD-0042',
  createdAt: new Date(),
  lines: [{ quantity: 2, label: 'Hamburguesa sencilla', notes: 'sin cebolla' }],
  fulfillment: 'delivery',
  address: 'Cra 27 #45-12',
  neighborhood: 'Cabecera',
  paymentMethod: 'cod',
  cashChangeFor: 50000,
  total: 36000,
  etaMinutes: 45,
  customerName: 'Ana',
  customerPhoneMasked: '+57300***0101',
};

describe('WhatsAppKitchenSink (AC-15, AC-37)', () => {
  const build = (whatsappNumber: string | null) => {
    const prisma = { merchant: { findUnique: jest.fn().mockResolvedValue({ whatsappNumber }) } };
    const messenger = {
      notify: jest.fn().mockResolvedValue({ status: 'queued', channel: 'template', outboxId: 'x' }),
    };
    const sink = new WhatsAppKitchenSink(
      prisma as unknown as PrismaService,
      messenger as unknown as BusinessMessengerService,
      new KitchenTicketPresenter(),
    );
    return { sink, messenger };
  };

  it('sends the comanda via BusinessMessenger with one-line items, free-text ticket and stable dedupeKey', async () => {
    const { sink, messenger } = build('+573000000001');
    await sink.publish('m1', ticket);
    const req = messenger.notify.mock.calls[0][0];
    expect(req).toMatchObject({
      to: '+573000000001',
      orderId: 'o1',
      template: 'comanda_nuevo_pedido',
      dedupeKey: 'order:o1:kitchen',
    });
    expect(req.params.items).toBe('2x Hamburguesa sencilla (sin cebolla)');
    expect(req.params.total).toBe('$36.000');
    expect(Object.values(req.params).every((v) => !String(v).includes('\n'))).toBe(true);
    expect(req.freeText).toContain('Nuevo pedido ORD-0042');
  });

  it('no merchant number → nothing sent, no throw', async () => {
    const { sink, messenger } = build(null);
    await expect(sink.publish('m1', ticket)).resolves.toBeUndefined();
    expect(messenger.notify).not.toHaveBeenCalled();
  });
});

describe('OrderSinkRunner (RN-23)', () => {
  it('runs sinks in order and a failing sink does not stop the next one', async () => {
    const calls: string[] = [];
    const sinks: OrderSink[] = [
      {
        name: 'whatsapp_kitchen',
        publish: async () => {
          calls.push('kitchen');
          throw new Error('boom');
        },
      },
      {
        name: 'pos',
        publish: async () => {
          calls.push('pos');
        },
      },
    ];
    const results = await new OrderSinkRunner(sinks).publish('m1', ticket);
    expect(calls).toEqual(['kitchen', 'pos']);
    expect(results).toEqual([
      { sink: 'whatsapp_kitchen', ok: false },
      { sink: 'pos', ok: true },
    ]);
  });
});
