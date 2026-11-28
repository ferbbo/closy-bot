import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { CartView, Fulfillment, OrderSummaryView } from '../contracts';
import { formatCop } from './cart.presenter';

export interface OrderSummaryInput {
  cart: CartView;
  fulfillment: Fulfillment;
  address: string | null;
  neighborhood: string | null;
  zoneName: string | null;
  fee: number;
  etaMinutes: number | null;
  paymentMethod: 'cod' | 'transfer';
  cashChangeFor: number | null;
}

const RULE = '─────────────';
const WIDTH = 44;

function row(left: string, right: string): string {
  const dots = Math.max(3, WIDTH - left.length - right.length - 2);
  return `${left} ${'.'.repeat(dots)} ${right}`;
}

/**
 * OrderSummaryPresenter (S3.3, RN-01/RN-12): bloque EXACTO del resumen previo a confirmar.
 * Total = subtotal (BD) + tarifa (cotización). El hash cubre carrito, entrega y pago: si algo
 * cambia después del resumen, el hash no coincide y `confirmar_pedido` exige uno nuevo.
 */
@Injectable()
export class OrderSummaryPresenter {
  present(input: OrderSummaryInput): OrderSummaryView {
    const total = input.cart.subtotal + input.fee;
    return {
      block: this.render(input, total),
      total,
      hash: this.hash(input),
      confirmationToken: randomBytes(9).toString('base64url'),
    };
  }

  hash(input: OrderSummaryInput): string {
    const canonical = {
      lines: input.cart.lines
        .map((l) => [l.itemId, l.quantity, l.unitPrice, l.notes])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      subtotal: input.cart.subtotal,
      fulfillment: input.fulfillment,
      address: input.address ?? null,
      neighborhood: input.neighborhood ?? null,
      fee: input.fee,
      paymentMethod: input.paymentMethod,
      cashChangeFor: input.cashChangeFor ?? null,
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private render(input: OrderSummaryInput, total: number): string {
    const lines = input.cart.lines.map((l) =>
      row(`${l.quantity}× ${l.label}${l.notes ? ` (${l.notes})` : ''}`, formatCop(l.lineTotal)),
    );
    const delivery =
      input.fulfillment === 'pickup'
        ? row('Recoges en el local', formatCop(0))
        : row(`Domicilio${input.zoneName ? ` ${input.zoneName}` : ''}`, formatCop(input.fee));
    const pay =
      input.paymentMethod === 'cod'
        ? `Efectivo${input.cashChangeFor ? ` · cambio de ${formatCop(input.cashChangeFor)}` : ''}`
        : 'Transferencia';
    const eta = input.etaMinutes ? ` · ~${input.etaMinutes} min` : '';
    const where =
      input.fulfillment === 'delivery' && input.address
        ? `\n${input.address}${input.neighborhood ? `, ${input.neighborhood}` : ''}`
        : '';
    return [
      RULE,
      ...lines,
      delivery,
      row('Total', formatCop(total)),
      `${pay}${eta}${where}`,
      RULE,
    ].join('\n');
  }
}
