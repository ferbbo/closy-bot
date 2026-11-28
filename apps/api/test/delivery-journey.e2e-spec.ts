import { SANDBOX_APP } from './meta-sandbox/sandbox-app';
import {
  DELIVERY_MERCHANT_ID,
  startDeliveryApp,
  type DeliveryE2eHarness,
} from './utils/delivery-e2e.harness';

jest.setTimeout(60000); // beforeAll runs the demo seed with tsx

/**
 * S5.5-T1 — Viaje completo (AC-29), del webhook al pedido entregado, con el LLM falso:
 * menú → pedido natural → entrega + pago → resumen exacto → "dale" → Order + comanda →
 * `preparando` / `salió` / `entregado` del encargado → el cliente consulta el estado.
 * Todo entra por `POST /webhooks/whatsapp` firmado (Meta Sandbox) y todo lo que sale del
 * negocio queda en el outbox (sin proveedores reales).
 */
describe('Delivery journey (e2e)', () => {
  // Meta envía `from` sin "+" y el legacy compara exacto contra merchant.whatsappNumber
  const merchantPhone = SANDBOX_APP.merchantPhone.replace(/\D/g, '');
  const customerPhone = SANDBOX_APP.customers[2];
  const where = { merchantId: DELIVERY_MERCHANT_ID };
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

  it('AC-29: webhook → menu → order → summary → "dale" → kitchen → preparing → on the way → delivered', async () => {
    const { fake, prisma, sendText, variants: v } = h;

    // 1) Menú desde la BD (ver_menu) — el LLM no inventa productos ni precios
    fake.enqueue(
      { toolCalls: [{ name: 'ver_menu', arguments: {} }] },
      { text: '¡Hola! Te comparto el menú 🍔' },
    );
    await sendText(customerPhone, 'hola, qué tienen?');
    expect(fake.calls.length).toBeGreaterThan(0);

    // 2) Pedido en lenguaje natural
    fake.enqueue(
      {
        toolCalls: [
          { name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } },
          { name: 'buscar_producto', arguments: { query: 'coca' } },
        ],
      },
      {
        toolCalls: [
          {
            name: 'agregar_al_carrito',
            arguments: { variantId: v['HAM-SEN'], cantidad: 2, notas: 'sin cebolla' },
          },
          { name: 'agregar_al_carrito', arguments: { variantId: v['BEB-COCA-400'], cantidad: 1 } },
        ],
      },
      { text: 'Listo, van $36.000. ¿A qué dirección te lo enviamos?' },
    );
    await sendText(customerPhone, 'me mandas 2 hamburguesas sencillas sin cebolla y una coca');

    // 3) Entrega + pago en un mensaje → resumen exacto del presenter
    fake.enqueue(
      {
        toolCalls: [
          {
            name: 'fijar_entrega',
            arguments: { direccion: 'Cra 27 #45-12', barrio: 'cabecera', referencia: 'portería' },
          },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      {
        toolCalls: [
          { name: 'fijar_pago', arguments: { metodo: 'cod', pagaCon: '50' } },
          { name: 'resumen_pedido', arguments: {} },
        ],
      },
      { text: 'El domicilio a Cabecera vale $4.000. Te dejo el resumen, ¿lo confirmo?' },
    );
    const summary = await sendText(
      customerPhone,
      'a la cra 27 #45-12 en cabecera, portería. pago en efectivo con 50',
    );
    expect(summary).toMatch(/Total \.+ \$40\.000/);
    expect(await prisma.order.count({ where })).toBe(0);

    const conv = await prisma.conversation.findFirstOrThrow({
      where: { ...where, customer: { phone: customerPhone.replace(/\D/g, '') } },
    });
    const token = (conv.metadata as { delivery: { checkout: { summary: { token: string } } } })
      .delivery.checkout.summary.token;

    // 4) Confirmación → Order + comanda al encargado + plantilla al cliente
    fake.enqueue(
      { toolCalls: [{ name: 'confirmar_pedido', arguments: { confirmationToken: token } }] },
      { text: '¡Listo! Tu pedido ya está en cocina 🍔' },
    );
    await sendText(customerPhone, 'dale');

    let order = await prisma.order.findFirstOrThrow({ where, include: { items: true } });
    expect(order.status).toBe('confirmed');
    expect(Number(order.totalAmount)).toBe(40000);
    expect(order.items).toHaveLength(2);
    const kitchen = await prisma.outboxMessage.findMany({
      where: { ...where, dedupeKey: `order:${order.id}:kitchen` },
    });
    expect(kitchen).toHaveLength(1);

    // 5) Ciclo de cocina por comandos del encargado (por WhatsApp, mismo webhook)
    const code = order.orderCode;
    const number = code.replace(/\D/g, '').replace(/^0+/, '');
    await sendText(merchantPhone, `preparando ${number} 20`);
    order = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(order.status).toBe('preparing');

    await sendText(merchantPhone, `salió ${number}`);
    order = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(order.status).toBe('on_the_way');

    // 6) El cliente pregunta por su pedido en camino (estado leído de la BD)
    fake.enqueue(
      { toolCalls: [{ name: 'estado_pedido', arguments: {} }] },
      { text: `Tu pedido ${code} ya va en camino 🛵` },
    );
    const status = await sendText(customerPhone, 'cómo va mi pedido?');
    expect(status).toContain(code);

    await sendText(merchantPhone, `entregado ${code}`);
    order = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(order.status).toBe('delivered');

    // Cada estado notificó al cliente exactamente una vez (BusinessMessenger, dedupeKey)
    const statusKeys = (
      await prisma.outboxMessage.findMany({
        where: { ...where, dedupeKey: { startsWith: `order:${order.id}:status:` } },
      })
    )
      .map((m) => String(m.dedupeKey))
      .sort();
    expect(statusKeys).toEqual([
      `order:${order.id}:status:confirmed`,
      `order:${order.id}:status:delivered`,
      `order:${order.id}:status:on_the_way`,
      `order:${order.id}:status:preparing`,
    ]);
    // El LLM consumió exactamente los turnos encolados (no hubo llamadas de más)
    expect(fake.remaining).toBe(0);
  });
});
