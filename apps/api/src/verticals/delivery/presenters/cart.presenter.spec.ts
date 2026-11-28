import { Decimal } from '@prisma/client/runtime/library';
import type { CartWithItems } from '../../../persistence/repositories/cart.repository';
import { CartPresenter, cartLineLabel, formatCop } from './cart.presenter';

function item(
  id: string,
  product: string,
  variant: string,
  notes: string,
  qty: number,
  price: number,
) {
  return {
    id,
    cartId: 'cart-1',
    variantId: `v-${id}`,
    notes,
    quantity: qty,
    priceSnapshot: new Decimal(price),
    createdAt: new Date(),
    updatedAt: new Date(),
    variant: {
      id: `v-${id}`,
      name: variant,
      price: new Decimal(price),
      productId: `p-${id}`,
      product: { id: `p-${id}`, name: product },
    },
  };
}

function cart(items: ReturnType<typeof item>[]): CartWithItems {
  return { id: 'cart-1', items } as unknown as CartWithItems;
}

describe('CartPresenter (S2.2-T3)', () => {
  const presenter = new CartPresenter();

  it('formatCop usa el formato $28.000', () => {
    expect(formatCop(28000)).toBe('$28.000');
    expect(formatCop(4000)).toBe('$4.000');
    expect(formatCop(1250000)).toBe('$1.250.000');
    expect(formatCop(0)).toBe('$0');
    expect(formatCop(999.6)).toBe('$1.000');
  });

  it('cartLineLabel omite variantes placeholder y agrega las informativas', () => {
    expect(cartLineLabel('Hamburguesa sencilla', 'Única')).toBe('Hamburguesa sencilla');
    expect(cartLineLabel('Perro sencillo', 'Único')).toBe('Perro sencillo');
    expect(cartLineLabel('Coca-Cola', '400 ml')).toBe('Coca-Cola 400 ml');
  });

  it('AC-03/AC-08: toView calcula subtotal como suma de BD y conserva las notas por línea', () => {
    const view = presenter.toView(
      cart([
        item('i1', 'Hamburguesa sencilla', 'Única', 'sin cebolla', 2, 16000),
        item('i2', 'Hamburguesa sencilla', 'Única', '', 1, 16000),
        item('i3', 'Coca-Cola', '400 ml', '', 1, 4000),
      ]),
    );

    expect(view.cartId).toBe('cart-1');
    expect(view.lines).toEqual([
      {
        itemId: 'i1',
        label: 'Hamburguesa sencilla',
        notes: 'sin cebolla',
        quantity: 2,
        unitPrice: 16000,
        lineTotal: 32000,
      },
      {
        itemId: 'i2',
        label: 'Hamburguesa sencilla',
        notes: '',
        quantity: 1,
        unitPrice: 16000,
        lineTotal: 16000,
      },
      {
        itemId: 'i3',
        label: 'Coca-Cola 400 ml',
        notes: '',
        quantity: 1,
        unitPrice: 4000,
        lineTotal: 4000,
      },
    ]);
    expect(view.subtotal).toBe(52000);
  });

  it('render muestra notas visibles y cifras con formato', () => {
    const text = presenter.render(
      presenter.toView(
        cart([
          item('i1', 'Hamburguesa sencilla', 'Única', 'sin cebolla', 2, 16000),
          item('i3', 'Coca-Cola', '400 ml', '', 1, 4000),
        ]),
      ),
    );

    expect(text).toBe(
      [
        '• 2× Hamburguesa sencilla (sin cebolla) — $32.000',
        '• 1× Coca-Cola 400 ml — $4.000',
        'Subtotal: $36.000',
      ].join('\n'),
    );
  });

  it('render de carrito vacío', () => {
    expect(presenter.render(presenter.toView(cart([])))).toBe('Tu carrito está vacío.');
  });
});
