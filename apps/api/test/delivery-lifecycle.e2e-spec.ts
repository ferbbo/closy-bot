import { SANDBOX_APP } from './meta-sandbox/sandbox-app';
import {
  createDeliveryOrder,
  DELIVERY_MERCHANT_ID,
  startDeliveryApp,
  type DeliveryE2eHarness,
} from './utils/delivery-e2e.harness';

jest.setTimeout(60000); // beforeAll runs the demo seed with tsx

/**
 * S4.1-T3 (deuda) — Ciclo de vida de cocina por comandos del encargado (AC-16):
 * confirmado → `preparando N 20` → `salio N` → `entregado N`, cada paso notifica al cliente
 * una sola vez por BusinessMessenger (dedupeKey order:{id}:status:{s}); transición inválida
 * e idempotencia responden al encargado sin cambiar el pedido.
 */
describe('Delivery lifecycle (e2e)', () => {
  // Meta envía `from` sin "+" y el legacy compara exacto contra merchant.whatsappNumber
  const merchantPhone = SANDBOX_APP.merchantPhone.replace(/\D/g, '');
  const customerPhone = SANDBOX_APP.customers[1];
  let h: DeliveryE2eHarness;

  beforeAll(async () => {
    h = await startDeliveryApp();
    await h.prisma.merchant.update({
      where: { id: DELIVERY_MERCHANT_ID },
      data: { whatsappNumber: merchantPhone },
    });
  });

  afterAll(async () => {
    await h?.close();
  });

  const statusKeys = async (orderId: string): Promise<string[]> =>
    (
      await h.prisma.outboxMessage.findMany({
        where: {
          merchantId: DELIVERY_MERCHANT_ID,
          dedupeKey: { startsWith: `order:${orderId}:status:` },
        },
      })
    )
      .map((m) => String(m.dedupeKey))
      .sort();

  it('AC-16: preparando → salio → entregado moves the order and notifies the customer once per state', async () => {
    const order = await createDeliveryOrder(h.prisma, {
      phone: customerPhone,
      orderCode: 'ORD-0042',
      status: 'confirmed',
      items: [
        {
          variantId: h.variants['HAM-SEN'],
          quantity: 2,
          unitPrice: 16000,
          name: 'Hamburguesa sencilla',
        },
      ],
    });

    const preparing = await h.sendText(merchantPhone, 'preparando 42 20');
    expect(preparing).toContain('ORD-0042');
    let row = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('preparing');

    await h.sendText(merchantPhone, 'salió 42');
    row = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('on_the_way');

    await h.sendText(merchantPhone, 'entregado ORD-0042');
    row = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('delivered');

    expect(await statusKeys(order.id)).toEqual([
      `order:${order.id}:status:delivered`,
      `order:${order.id}:status:on_the_way`,
      `order:${order.id}:status:preparing`,
    ]);
  });

  it('AC-16: repeated command is idempotent and an invalid transition is rejected with a hint', async () => {
    const order = await createDeliveryOrder(h.prisma, {
      phone: customerPhone,
      orderCode: 'ORD-0043',
      status: 'confirmed',
      items: [
        { variantId: h.variants['PER-SEN'], quantity: 1, unitPrice: 12000, name: 'Perro sencillo' },
      ],
    });

    await h.sendText(merchantPhone, 'preparando 43');
    const again = await h.sendText(merchantPhone, 'preparando 43');
    expect(again).toContain('ya estaba');

    const invalid = await h.sendText(merchantPhone, 'entregado 43');
    expect(invalid).toContain('❌');
    expect(invalid).toContain('salio ORD-0043');
    const row = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('preparing');
    expect(await statusKeys(order.id)).toEqual([`order:${order.id}:status:preparing`]);
  });

  it('AC-16: cancelar N motivo sets cancelledAt; unknown order answers NOT_FOUND', async () => {
    const order = await createDeliveryOrder(h.prisma, {
      phone: customerPhone,
      orderCode: 'ORD-0044',
      status: 'confirmed',
      items: [{ variantId: h.variants['BEB-AGUA'], quantity: 1, unitPrice: 3000, name: 'Agua' }],
    });

    await h.sendText(merchantPhone, 'cancelar 44 Sin domiciliario');
    const row = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('cancelled');
    expect(row.cancelledAt).toBeInstanceOf(Date);

    const missing = await h.sendText(merchantPhone, 'salio 9999');
    expect(missing).toContain('No encontré el pedido');
  });
});
