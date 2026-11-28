import { Injectable } from '@nestjs/common';
import type { KitchenTicket } from '../contracts';
import { formatCop } from './cart.presenter';

/**
 * KitchenTicketPresenter (S3.3, AC-15/AC-37): comanda para el encargado.
 * - `render`: texto completo (ventana abierta y mode=auto).
 * - `itemsOneLine`: ítems en una sola línea para el parámetro de la plantilla
 *   `comanda_nuevo_pedido` (sin saltos de línea, RN-31).
 */
@Injectable()
export class KitchenTicketPresenter {
  render(t: KitchenTicket): string {
    const items = t.lines.map(
      (l) => `• ${l.quantity}× ${l.label}${l.notes ? ` (${l.notes})` : ''}`,
    );
    const where =
      t.fulfillment === 'pickup'
        ? 'Recoge en el local'
        : `${t.address ?? '-'}${t.neighborhood ? ` · ${t.neighborhood}` : ''}`;
    const pay =
      t.paymentMethod === 'cod'
        ? `Efectivo${t.cashChangeFor ? ` · cambio de ${formatCop(t.cashChangeFor)}` : ''}`
        : t.paymentMethod === 'transfer'
          ? 'Transferencia (verificar comprobante)'
          : t.paymentMethod;
    return [
      `🧾 Nuevo pedido ${t.orderCode}`,
      ...items,
      `📍 ${where}`,
      `💵 ${pay} · Total ${formatCop(t.total)}`,
      ...(t.etaMinutes ? [`⏱️ ETA ~${t.etaMinutes} min`] : []),
      `👤 ${t.customerName} · ${t.customerPhoneMasked}`,
      `Responde: preparando ${t.orderCode.replace(/\D/g, '').replace(/^0+/, '') || t.orderCode}`,
    ].join('\n');
  }

  itemsOneLine(t: KitchenTicket): string {
    return t.lines
      .map((l) => `${l.quantity}x ${l.label}${l.notes ? ` (${l.notes})` : ''}`)
      .join('; ');
  }
}
