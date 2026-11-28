import type { CartView, KitchenTicket } from '../contracts';
import { KitchenTicketPresenter } from './kitchen-ticket.presenter';
import { OrderSummaryInput, OrderSummaryPresenter } from './order-summary.presenter';

const cart: CartView = {
  cartId: 'cart1',
  subtotal: 32000,
  lines: [
    {
      itemId: 'i1',
      label: 'Hamburguesa sencilla',
      notes: 'sin cebolla',
      quantity: 2,
      unitPrice: 14000,
      lineTotal: 28000,
    },
    {
      itemId: 'i2',
      label: 'Coca-Cola 400 ml',
      notes: '',
      quantity: 1,
      unitPrice: 4000,
      lineTotal: 4000,
    },
  ],
};
const input: OrderSummaryInput = {
  cart,
  fulfillment: 'delivery',
  address: 'Cra 27 #45-12',
  neighborhood: 'Cabecera',
  zoneName: 'Cabecera',
  fee: 4000,
  etaMinutes: 45,
  paymentMethod: 'cod',
  cashChangeFor: 50000,
};

describe('OrderSummaryPresenter (RN-01, RN-12)', () => {
  const presenter = new OrderSummaryPresenter();

  it('renders the exact summary block with DB figures; total = subtotal + fee', () => {
    const view = presenter.present(input);
    expect(view.total).toBe(36000);
    expect(view.block).toContain('2× Hamburguesa sencilla (sin cebolla)');
    expect(view.block).toContain('$28.000');
    expect(view.block).toContain('Domicilio Cabecera');
    expect(view.block).toMatch(/Total \.+ \$36\.000/);
    expect(view.block).toContain('Efectivo · cambio de $50.000 · ~45 min');
    expect(view.confirmationToken).toMatch(/^[\w-]{10,}$/);
  });

  it('pickup has no delivery fee line value and no address', () => {
    const view = presenter.present({
      ...input,
      fulfillment: 'pickup',
      fee: 0,
      address: null,
      neighborhood: null,
    });
    expect(view.total).toBe(32000);
    expect(view.block).toContain('Recoges en el local');
    expect(view.block).not.toContain('Cra 27');
  });

  it('hash is stable for the same data and changes when cart, delivery or payment change', () => {
    const h = presenter.hash(input);
    expect(presenter.hash({ ...input })).toBe(h);
    expect(
      presenter.hash({ ...input, cart: { ...cart, lines: [cart.lines[0]], subtotal: 28000 } }),
    ).not.toBe(h);
    expect(presenter.hash({ ...input, neighborhood: 'Provenza' })).not.toBe(h);
    expect(presenter.hash({ ...input, cashChangeFor: 100000 })).not.toBe(h);
  });
});

describe('KitchenTicketPresenter (AC-15, AC-37)', () => {
  const ticket: KitchenTicket = {
    orderId: 'o1',
    orderCode: 'ORD-0042',
    createdAt: new Date('2026-11-27T20:00:00-05:00'),
    lines: [
      { quantity: 2, label: 'Hamburguesa sencilla', notes: 'sin cebolla' },
      { quantity: 1, label: 'Coca-Cola 400 ml', notes: '' },
    ],
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
  const presenter = new KitchenTicketPresenter();

  it('full ticket has code, items with notes, address, neighborhood, payment, change and ETA', () => {
    const text = presenter.render(ticket);
    for (const part of [
      'ORD-0042',
      '2× Hamburguesa sencilla (sin cebolla)',
      'Cra 27 #45-12',
      'Cabecera',
      'cambio de $50.000',
      '$36.000',
      '45 min',
    ]) {
      expect(text).toContain(part);
    }
  });

  it('items in one line for the template parameter (no newlines)', () => {
    const line = presenter.itemsOneLine(ticket);
    expect(line).toBe('2x Hamburguesa sencilla (sin cebolla); 1x Coca-Cola 400 ml');
    expect(line).not.toContain('\n');
  });
});
