import { Decimal } from '@prisma/client/runtime/library';
import type { PrismaService } from '../../../../persistence/prisma/prisma.service';
import type { CartRepository } from '../../../../persistence/repositories/cart.repository';
import { buildRestauranteDefaults } from '../../config/restaurante.defaults';
import { CartPresenter } from '../../presenters/cart.presenter';
import type { CheckoutDraft, DeliveryTurnContext } from '../../contracts';
import { parseCashAmount, PaymentTools } from './payment.tools';

const item = (quantity: number, price: number) => ({
  id: `i-${price}`,
  cartId: 'cart-1',
  variantId: `v-${price}`,
  notes: '',
  quantity,
  priceSnapshot: new Decimal(price),
  variant: { id: `v-${price}`, name: 'Única', product: { id: 'p', name: 'Hamburguesa' } },
});

const QUOTE: NonNullable<CheckoutDraft['quote']> = {
  ok: true,
  zoneId: 'cabecera',
  zoneName: 'Cabecera',
  fee: 4000,
  etaMinutes: 20,
  fulfillment: 'delivery',
};

const PAYMENTS = [
  { type: 'cod', label: 'Efectivo' },
  {
    type: 'transfer',
    label: 'Nequi',
    bankInfo: { bankName: 'Nequi', accountType: 'Ahorros', accountNumber: '3000000000' },
  },
];

describe('parseCashAmount (AC-13)', () => {
  it.each([
    ['50 mil', 50000],
    ['50.000', 50000],
    ['50k', 50000],
    ['50K', 50000],
    ['con 50', 50000],
    ['$100.000', 100000],
    ['pago con un billete de 100.000 pesos', 100000],
    ['50000', 50000],
    ['1.500.000', 1500000],
    ['20 lucas', 20000],
    ['2,5 mil', 2500],
  ])('"%s" → %d', (text, expected) => {
    expect(parseCashAmount(text)).toBe(expected);
  });

  it.each([
    [50, 50000],
    [50000, 50000],
  ])('número %d → %d', (n, expected) => {
    expect(parseCashAmount(n)).toBe(expected);
  });

  it.each(['', 'exacto', 'mil', '0', -5, null, undefined, {}])('sin monto %p → null', (v) => {
    expect(parseCashAmount(v)).toBeNull();
  });
});

describe('PaymentTools.fijar_pago (S3.2-T2)', () => {
  let metadata: Record<string, unknown>;
  let paymentMethods: unknown;
  let items: ReturnType<typeof item>[];
  let prisma: {
    merchantConfig: { findUnique: jest.Mock };
    conversation: { findUnique: jest.Mock; update: jest.Mock };
  };
  let cartRepository: { findActiveCart: jest.Mock; findByIdWithItems: jest.Mock };
  let tools: PaymentTools;
  const ctx: DeliveryTurnContext = {
    merchantId: 'm1',
    customerId: 'c1',
    conversationId: 'conv1',
    customerPhone: '+570000000000',
    text: 'x',
    config: buildRestauranteDefaults(),
    now: new Date('2026-12-01T17:00:00Z'),
    seenVariantIds: new Set(),
  };
  const run = (args: Record<string, unknown>) => tools.handlers().fijar_pago(args, ctx);
  const savedCheckout = () =>
    (
      prisma.conversation.update.mock.calls[0][0].data.metadata as {
        delivery: { checkout: CheckoutDraft };
      }
    ).delivery.checkout;

  beforeEach(() => {
    paymentMethods = PAYMENTS;
    items = [item(2, 16000)]; // subtotal 32.000
    metadata = {
      expecting: { kind: 'x' },
      delivery: { lastCandidates: { items: [] }, checkout: { cartId: 'cart-1', quote: QUOTE } },
    };
    prisma = {
      merchantConfig: {
        findUnique: jest.fn().mockImplementation(async () => ({ paymentMethods })),
      },
      conversation: {
        findUnique: jest.fn().mockImplementation(async () => ({ metadata })),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    cartRepository = {
      findActiveCart: jest.fn().mockResolvedValue({ id: 'cart-1' }),
      findByIdWithItems: jest.fn().mockImplementation(async () => ({ id: 'cart-1', items })),
    };
    tools = new PaymentTools(
      prisma as unknown as PrismaService,
      cartRepository as unknown as CartRepository,
      new CartPresenter(),
    );
  });

  it('expone la definición fijar_pago con metodo cod|transfer', () => {
    expect(tools.definitions.map((d) => d.name)).toEqual(['fijar_pago']);
    expect(Object.keys(tools.handlers())).toEqual(['fijar_pago']);
  });

  it.each(['50 mil', '50.000', '50k'])(
    'AC-13: efectivo con "%s" → cashChangeFor=50000 persistido',
    async (pagaCon) => {
      const res = await run({ metodo: 'cod', pagaCon });
      expect(res).toEqual({
        ok: true,
        data: { metodo: 'cod', label: 'Efectivo', total: 36000, pagaCon: 50000, cambio: 14000 },
      });
      expect(savedCheckout()).toEqual({
        cartId: 'cart-1',
        quote: QUOTE,
        paymentMethod: 'cod',
        cashChangeFor: 50000,
      });
    },
  );

  it('AC-13: pagaCon menor que el total → CASH_BELOW_TOTAL y no persiste', async () => {
    const res = await run({ metodo: 'cod', pagaCon: '20 mil' });
    expect(res).toEqual({
      ok: false,
      error: 'CASH_BELOW_TOTAL',
      data: { total: 36000, pagaCon: 20000 },
    });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('pagaCon igual al total se acepta (cambio 0)', async () => {
    const res = await run({ metodo: 'cod', pagaCon: 36000 });
    expect(res.ok).toBe(true);
    expect((res.data as Record<string, unknown>).cambio).toBe(0);
  });

  it('efectivo sin pagaCon → persiste método y pide el monto', async () => {
    const res = await run({ metodo: 'cod' });
    expect(res).toEqual({
      ok: true,
      data: {
        metodo: 'cod',
        label: 'Efectivo',
        total: 36000,
        pagaCon: null,
        pedirMontoEfectivo: true,
      },
    });
    expect(savedCheckout().cashChangeFor).toBeNull();
  });

  it('pagaCon ilegible → INVALID_CASH_AMOUNT', async () => {
    expect(await run({ metodo: 'cod', pagaCon: 'lo exacto' })).toEqual({
      ok: false,
      error: 'INVALID_CASH_AMOUNT',
    });
  });

  it('delivery sin cotización y con pagaCon → NEEDS_QUOTE', async () => {
    metadata = { delivery: { checkout: { cartId: 'cart-1', fulfillment: 'delivery' } } };
    expect(await run({ metodo: 'cod', pagaCon: '50 mil' })).toEqual({
      ok: false,
      error: 'NEEDS_QUOTE',
    });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('pickup (fee 0): total = subtotal aunque haya una cotización previa', async () => {
    metadata = {
      delivery: { checkout: { cartId: 'cart-1', fulfillment: 'pickup', quote: QUOTE } },
    };
    const res = await run({ metodo: 'cod', pagaCon: '32 mil' });
    expect(res).toEqual({
      ok: true,
      data: { metodo: 'cod', label: 'Efectivo', total: 32000, pagaCon: 32000, cambio: 0 },
    });
  });

  it('pickup sin cotización no exige NEEDS_QUOTE', async () => {
    metadata = { delivery: { checkout: { cartId: 'cart-1', fulfillment: 'pickup' } } };
    expect((await run({ metodo: 'cod', pagaCon: 50000 })).ok).toBe(true);
    expect(savedCheckout()).toMatchObject({ fulfillment: 'pickup', cashChangeFor: 50000 });
  });

  it('transferencia → instrucciones LITERALES de la BD y cashChangeFor null', async () => {
    const res = await run({ metodo: 'transfer', pagaCon: '50 mil' });
    expect(res).toEqual({
      ok: true,
      data: {
        metodo: 'transfer',
        label: 'Nequi',
        total: 36000,
        instrucciones: 'Nequi · Ahorros · 3000000000',
      },
    });
    expect(savedCheckout()).toMatchObject({ paymentMethod: 'transfer', cashChangeFor: null });
  });

  it('transferencia con instructions explícitas las prioriza; sin datos → null', async () => {
    paymentMethods = [{ type: 'transfer', label: 'Banco', instructions: 'Llave @burger' }];
    expect(
      ((await run({ metodo: 'transfer' })).data as Record<string, unknown>).instrucciones,
    ).toBe('Llave @burger');
    paymentMethods = [{ type: 'transfer', label: 'Banco' }];
    expect(
      ((await run({ metodo: 'transfer' })).data as Record<string, unknown>).instrucciones,
    ).toBeNull();
  });

  it('método no configurado → METHOD_NOT_AVAILABLE con los disponibles', async () => {
    paymentMethods = [
      { type: 'cod', label: 'Efectivo' },
      { type: 'payment_link', label: 'Link' },
    ];
    expect(await run({ metodo: 'transfer' })).toEqual({
      ok: false,
      error: 'METHOD_NOT_AVAILABLE',
      data: { disponibles: [{ type: 'cod', label: 'Efectivo' }] },
    });
  });

  it('sin paymentMethods en la BD → METHOD_NOT_AVAILABLE con lista vacía', async () => {
    paymentMethods = null;
    expect(await run({ metodo: 'cod' })).toEqual({
      ok: false,
      error: 'METHOD_NOT_AVAILABLE',
      data: { disponibles: [] },
    });
  });

  it('método inválido → INVALID_ARGS', async () => {
    expect(await run({ metodo: 'tarjeta' })).toEqual({ ok: false, error: 'INVALID_ARGS' });
  });

  it('carrito vacío o inexistente → EMPTY_CART', async () => {
    items = [];
    expect((await run({ metodo: 'cod' })).error).toBe('EMPTY_CART');
    cartRepository.findActiveCart.mockResolvedValue(null);
    expect((await run({ metodo: 'cod' })).error).toBe('EMPTY_CART');
  });

  it('merge de metadata: conserva expecting y delivery.lastCandidates', async () => {
    await run({ metodo: 'cod' });
    const saved = prisma.conversation.update.mock.calls[0][0];
    expect(saved.where).toEqual({ id: 'conv1' });
    expect(saved.data.metadata.expecting).toEqual({ kind: 'x' });
    expect(saved.data.metadata.delivery.lastCandidates).toEqual({ items: [] });
  });

  it('sin draft previo → crea el draft con el cartId del carrito activo', async () => {
    metadata = {};
    await run({ metodo: 'transfer' });
    expect(savedCheckout()).toEqual({
      cartId: 'cart-1',
      paymentMethod: 'transfer',
      cashChangeFor: null,
    });
  });

  it('nunca lanza: error de BD → PAYMENT_ERROR', async () => {
    prisma.merchantConfig.findUnique.mockRejectedValue(new Error('db down'));
    expect(await run({ metodo: 'cod' })).toEqual({ ok: false, error: 'PAYMENT_ERROR' });
  });
});
