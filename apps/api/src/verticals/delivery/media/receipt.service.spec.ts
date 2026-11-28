import type { PrismaService } from '../../../persistence/prisma/prisma.service';
import type { BusinessMessengerService } from '../messaging/business-messenger.service';
import type { VerticalContext } from '../contracts';
import { captionMentionsPayment, RECEIPT_TEXTS, ReceiptForwarder } from './receipt.service';

const ctx = (caption?: string): VerticalContext => ({
  merchant: { id: 'm1', name: 'Burger Barrio', industry: 'restaurante', playbookConfig: null },
  customer: { id: 'c1', phone: '+573000000101' },
  conversation: { id: 'conv1', metadata: null },
  input: {
    messageId: 'wamid.IMG1',
    text: '',
    timestamp: new Date(),
    mediaType: 'image',
    mediaId: 'media-1',
    caption,
  },
});

describe('ReceiptForwarder (S5.3-T3)', () => {
  const setup = (order: { id: string; orderCode: string } | null) => {
    const prisma = {
      order: { findFirst: jest.fn().mockResolvedValue(order), update: jest.fn() },
    };
    const messenger = {
      alertOperation: jest
        .fn()
        .mockResolvedValue({ status: 'queued', channel: 'template', outboxId: 'o1' }),
    };
    const forwarder = new ReceiptForwarder(
      prisma as unknown as PrismaService,
      messenger as unknown as BusinessMessengerService,
    );
    return { prisma, messenger, forwarder };
  };

  it('AC-27: payment_receipt + pending_payment order → alert to the manager with the order code', async () => {
    const { forwarder, messenger, prisma } = setup({ id: 'ord1', orderCode: 'ORD-0042' });
    await expect(forwarder.handle(ctx(), 'payment_receipt')).resolves.toBe(RECEIPT_TEXTS.received);
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantId: 'm1', customerId: 'c1', status: 'pending_payment' },
      }),
    );
    expect(messenger.alertOperation).toHaveBeenCalledWith({
      merchantId: 'm1',
      alert: expect.stringContaining('PAGADO ORD-0042'),
      orderCode: 'ORD-0042',
      dedupeKey: 'order:ord1:receipt:wamid.IMG1',
    });
    // el bot nunca cambia el estado del pedido por la imagen
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('RN-26: caption mentioning payment forwards even if vision says product', async () => {
    const { forwarder, messenger } = setup({ id: 'ord1', orderCode: 'ORD-0042' });
    await expect(forwarder.handle(ctx('ahí va el comprobante'), 'product')).resolves.toBe(
      RECEIPT_TEXTS.received,
    );
    expect(messenger.alertOperation).toHaveBeenCalled();
  });

  it('payment_receipt without a pending order → asks which order', async () => {
    const { forwarder, messenger } = setup(null);
    await expect(forwarder.handle(ctx(), 'payment_receipt')).resolves.toBe(
      RECEIPT_TEXTS.whichOrder,
    );
    expect(messenger.alertOperation).not.toHaveBeenCalled();
  });

  it('payment caption without pending order and non-receipt image → null (normal flow)', async () => {
    const { forwarder } = setup(null);
    await expect(forwarder.handle(ctx('pago contra entrega?'), 'product')).resolves.toBeNull();
  });

  it('not a receipt (no caption, other kind) → null without querying orders', async () => {
    const { forwarder, prisma } = setup({ id: 'ord1', orderCode: 'ORD-0042' });
    await expect(forwarder.handle(ctx(), 'product')).resolves.toBeNull();
    await expect(forwarder.handle(ctx('hola'), null)).resolves.toBeNull();
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('captionMentionsPayment: payment words, whole words only', () => {
    expect(captionMentionsPayment('ya pagué')).toBe(true);
    expect(captionMentionsPayment('Transferencia Nequi')).toBe(true);
    expect(captionMentionsPayment('Comprobante')).toBe(true);
    expect(captionMentionsPayment('quiero esta hamburguesa')).toBe(false);
    expect(captionMentionsPayment('papagayo')).toBe(false);
    expect(captionMentionsPayment(undefined)).toBe(false);
  });
});
