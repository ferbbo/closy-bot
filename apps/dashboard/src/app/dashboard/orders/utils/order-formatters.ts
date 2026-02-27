/**
 * Order utility formatters
 * Used by OrderRow and OrdersTable
 */

export function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    cod: 'Contraentrega',
    transfer: 'Transferencia bancaria',
    payment_link: 'Link de pago',
  };
  return map[method] ?? method;
}
