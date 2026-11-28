import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import { DeliveryConfigService, normalizeText } from '../config/delivery-config.service';
import { cartLineLabel } from '../presenters/cart.presenter';

type StockAction = 'agotado' | 'disponible';

interface StockCandidate {
  variantId: string;
  label: string;
}

interface PendingStockChoice {
  action: StockAction;
  candidates: StockCandidate[];
  expiresAt: number;
}

/** Ventana de la desambiguación pendiente de agotado/disponible (RN-22). */
export const STOCK_CHOICE_TTL_MS = 10 * 60 * 1000;

/**
 * Sección de ayuda de delivery. `ayuda` devuelve SOLO esta sección: el comando legacy
 * decide si la concatena a su propia ayuda (no la duplicamos aquí).
 */
export const DELIVERY_HELP_TEXT = [
  '🛵 *Comandos de domicilios*',
  '• preparando <pedido> — el pedido entra a cocina',
  '• salio <pedido> — el pedido va en camino',
  '• entregado <pedido> — el pedido fue entregado',
  '• cancelar <pedido> — cancela el pedido',
  '• agotado <producto> — deja de ofrecerlo (ej: agotado coca 400)',
  '• disponible <producto> — lo vuelve a ofrecer',
  '• cerrar tienda / abrir tienda — pausa o reanuda los pedidos',
  '• reporte — pedidos facturables de hoy',
  '• reporte mes — pedidos facturables del mes',
  '<pedido> acepta 42, ORD-42 u ORD-0042.',
].join('\n');

/**
 * DeliveryCommandsService — comandos de operación del encargado (S4.3, F-12/F-13).
 *
 * `tryHandle` devuelve el texto de respuesta o `null` si el mensaje no es un comando
 * de este servicio (el comando legacy del encargado delega aquí; CONTRACTS §2).
 *
 * Desambiguación (RN-22): la lista numerada pendiente vive **en memoria** por
 * merchantId con TTL de 10 min. No es estado de negocio (solo ids de variantes ya
 * leídos de la BD); si el proceso reinicia, el encargado repite el comando.
 */
@Injectable()
export class DeliveryCommandsService {
  private readonly logger = new Logger(DeliveryCommandsService.name);
  private readonly pendingStock = new Map<string, PendingStockChoice>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryConfig: DeliveryConfigService,
  ) {}

  async tryHandle(merchantId: string, text: string): Promise<string | null> {
    const norm = normalizeText(text);
    if (!norm) return null;

    if (norm === 'ayuda' || norm === 'ayuda domicilios') return DELIVERY_HELP_TEXT;
    if (norm === 'cerrar tienda') return this.setTemporarilyClosed(merchantId, true);
    if (norm === 'abrir tienda') return this.setTemporarilyClosed(merchantId, false);

    const stock = /^(agotado|disponible)(?: (.+))?$/.exec(norm);
    if (stock) return this.handleStock(merchantId, stock[1] as StockAction, stock[2] ?? '');

    // Número suelto: solo es nuestro si hay una lista pendiente (si no → null, sigue el legacy).
    if (/^\d{1,2}$/.test(norm)) {
      const pending = this.getPending(merchantId);
      if (pending) return this.resolveChoice(merchantId, pending.action, Number(norm), pending);
    }

    return null;
  }

  // ===== cerrar / abrir tienda (AC-20) =====

  /** Cambia solo `deliveryConfig.temporarilyClosed`; el resto del JSON guardado queda igual. */
  private async setTemporarilyClosed(merchantId: string, closed: boolean): Promise<string> {
    const row = await this.prisma.merchantConfig.findUnique({
      where: { merchantId },
      select: { deliveryConfig: true },
    });
    if (!row) return 'Tu tienda aún no tiene configuración. Completa la configuración primero.';
    const stored = row.deliveryConfig;
    const base =
      stored && typeof stored === 'object' && !Array.isArray(stored)
        ? (stored as Record<string, unknown>)
        : {};
    const current = this.deliveryConfig.parseStored(merchantId, stored ?? null);
    if (current.temporarilyClosed === closed) {
      return closed ? 'La tienda ya estaba cerrada.' : 'La tienda ya estaba abierta.';
    }
    const next = { ...base, temporarilyClosed: closed };
    await this.prisma.merchantConfig.update({
      where: { merchantId },
      data: { deliveryConfig: next as unknown as Prisma.InputJsonValue },
    });
    this.logger.log(`Merchant ${merchantId} temporarilyClosed=${closed}`);
    return closed
      ? '🔒 Tienda cerrada. Aviso a los clientes que no estamos recibiendo pedidos. Escribe "abrir tienda" para reanudar.'
      : '🔓 Tienda abierta. Ya recibo pedidos en tu horario.';
  }

  // ===== agotado / disponible (RN-22, AC-20) =====

  private async handleStock(
    merchantId: string,
    action: StockAction,
    query: string,
  ): Promise<string> {
    if (!query) return `Escribe qué producto: "${action} <producto>". Ej: "${action} coca 400".`;

    if (/^\d{1,2}$/.test(query)) {
      const pending = this.getPending(merchantId);
      if (pending) return this.resolveChoice(merchantId, action, Number(query), pending);
    }

    const candidates = await this.findVariants(merchantId, query);
    if (candidates.length === 0) {
      return `No encontré "${query}" en tu menú. Revisa el nombre e intenta de nuevo.`;
    }
    if (candidates.length === 1) {
      this.pendingStock.delete(merchantId);
      return this.applyStock(merchantId, action, candidates[0]);
    }
    this.pendingStock.set(merchantId, {
      action,
      candidates,
      expiresAt: Date.now() + STOCK_CHOICE_TTL_MS,
    });
    const list = candidates.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
    return `Encontré varias opciones para "${query}":\n${list}\nResponde "${action} <número>" (ej: "${action} 1").`;
  }

  private async resolveChoice(
    merchantId: string,
    action: StockAction,
    n: number,
    pending: PendingStockChoice,
  ): Promise<string> {
    const chosen = pending.candidates[n - 1];
    if (!chosen) return `Elige un número entre 1 y ${pending.candidates.length}.`;
    this.pendingStock.delete(merchantId);
    return this.applyStock(merchantId, action, chosen);
  }

  private getPending(merchantId: string): PendingStockChoice | undefined {
    const pending = this.pendingStock.get(merchantId);
    if (!pending) return undefined;
    if (pending.expiresAt <= Date.now()) {
      this.pendingStock.delete(merchantId);
      return undefined;
    }
    return pending;
  }

  /** Variantes del comercio cuyo "producto + variante" contiene cada palabra buscada (prefijo de palabra). */
  private async findVariants(merchantId: string, query: string): Promise<StockCandidate[]> {
    const rows = await this.prisma.productVariant.findMany({
      where: { product: { merchantId } },
      select: { id: true, name: true, product: { select: { name: true } } },
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
    });
    const terms = query.split(' ');
    return rows
      .filter((r) => {
        const words = normalizeText(`${r.product.name} ${r.name}`).split(' ');
        return terms.every((t) => words.some((w) => w.startsWith(t)));
      })
      .map((r) => ({ variantId: r.id, label: cartLineLabel(r.product.name, r.name) }));
  }

  private async applyStock(
    merchantId: string,
    action: StockAction,
    c: StockCandidate,
  ): Promise<string> {
    const isActive = action === 'disponible';
    const res = await this.prisma.productVariant.updateMany({
      where: { id: c.variantId, product: { merchantId } },
      data: { isActive },
    });
    if (res.count === 0) return `No encontré "${c.label}" en tu menú.`;
    this.logger.log(`Variant ${c.variantId} isActive=${isActive} (merchant ${merchantId})`);
    return isActive
      ? `✅ ${c.label} vuelve a estar disponible.`
      : `🚫 ${c.label} quedó agotado. Ya no lo ofrezco a los clientes.`;
  }
}
