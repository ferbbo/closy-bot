import { SANDBOX_APP } from './meta-sandbox/sandbox-app';
import {
  createDeliveryOrder,
  DELIVERY_MERCHANT_ID,
  startDeliveryApp,
  type DeliveryE2eHarness,
} from './utils/delivery-e2e.harness';

jest.setTimeout(60000); // beforeAll runs the demo seed with tsx

/**
 * S4.2-T3 (deuda) — Autoservicio del cliente por WhatsApp con FakeLlm:
 * estado_pedido (AC-17), cancelar_pedido (AC-18) y repetir_pedido (AC-19).
 */
describe('Delivery customer self-service (e2e)', () => {
  const [statusPhone, cancelPhone, repeatPhone] = SANDBOX_APP.customers;
  let h: DeliveryE2eHarness;

  beforeAll(async () => {
    h = await startDeliveryApp();
  });

  afterAll(async () => {
    await h?.close();
  });

  it('AC-17: "¿cómo va mi pedido?" answers with the active order status from the DB', async () => {
    await createDeliveryOrder(h.prisma, {
      phone: statusPhone,
      orderCode: 'ORD-0050',
      status: 'preparing',
      items: [
        {
          variantId: h.variants['HAM-DOB'],
          quantity: 1,
          unitPrice: 22000,
          name: 'Hamburguesa doble',
        },
      ],
    });
    h.fake.enqueue(
      { toolCalls: [{ name: 'estado_pedido', arguments: {} }] },
      { text: 'Tu pedido ORD-0050 ya se está preparando 👨‍🍳' },
    );
    const reply = await h.sendText(statusPhone, 'cómo va mi pedido?');
    expect(reply).toContain('ORD-0050');
  });

  it('AC-18: the customer cancels a confirmed order; a preparing order cannot be cancelled', async () => {
    const confirmed = await createDeliveryOrder(h.prisma, {
      phone: cancelPhone,
      orderCode: 'ORD-0051',
      status: 'confirmed',
      items: [
        { variantId: h.variants['PER-ESP'], quantity: 1, unitPrice: 15000, name: 'Perro especial' },
      ],
    });
    h.fake.enqueue(
      { toolCalls: [{ name: 'cancelar_pedido', arguments: { motivo: 'me equivoqué' } }] },
      { text: 'Listo, cancelé tu pedido ORD-0051.' },
    );
    await h.sendText(cancelPhone, 'cancela mi pedido porfa, me equivoqué');
    const cancelled = await h.prisma.order.findUniqueOrThrow({ where: { id: confirmed.id } });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);

    const preparing = await createDeliveryOrder(h.prisma, {
      phone: cancelPhone,
      orderCode: 'ORD-0052',
      status: 'preparing',
      items: [
        { variantId: h.variants['PER-ESP'], quantity: 1, unitPrice: 15000, name: 'Perro especial' },
      ],
    });
    h.fake.enqueue(
      { toolCalls: [{ name: 'cancelar_pedido', arguments: { codigo: 'ORD-0052' } }] },
      { text: 'Ese pedido ya está en preparación, te paso con el local para revisarlo.' },
    );
    await h.sendText(cancelPhone, 'cancela el ORD-0052');
    const still = await h.prisma.order.findUniqueOrThrow({ where: { id: preparing.id } });
    expect(still.status).toBe('preparing');
  });

  it('AC-19: "lo mismo de la otra vez" re-adds the last delivered order with notes at current prices', async () => {
    await createDeliveryOrder(h.prisma, {
      phone: repeatPhone,
      orderCode: 'ORD-0053',
      status: 'delivered',
      items: [
        // precio histórico distinto al actual del seed (16000): el carrito usa el actual
        {
          variantId: h.variants['HAM-SEN'],
          quantity: 2,
          unitPrice: 15000,
          name: 'Hamburguesa sencilla',
          notes: 'sin cebolla',
        },
        {
          variantId: h.variants['BEB-COCA-400'],
          quantity: 1,
          unitPrice: 4000,
          name: 'Coca-Cola 400 ml',
        },
      ],
    });
    h.fake.enqueue(
      { toolCalls: [{ name: 'repetir_pedido', arguments: {} }] },
      { text: 'Listo, te armé lo mismo de la vez pasada. ¿Lo enviamos a la misma dirección?' },
    );
    await h.sendText(repeatPhone, 'quiero lo mismo de la otra vez');

    const customer = await h.prisma.customer.findUniqueOrThrow({
      where: { phone: repeatPhone.replace(/\D/g, '') },
    });
    const cart = await h.prisma.cart.findFirstOrThrow({
      where: { merchantId: DELIVERY_MERCHANT_ID, customerId: customer.id, status: 'active' },
      include: { items: true },
    });
    const burger = cart.items.find((i) => i.variantId === h.variants['HAM-SEN']);
    expect(burger?.quantity).toBe(2);
    expect(burger?.notes).toBe('sin cebolla');
    expect(Number(burger?.priceSnapshot)).toBe(16000);
    expect(cart.items.find((i) => i.variantId === h.variants['BEB-COCA-400'])?.quantity).toBe(1);
  });
});
