import { Injectable, Logger } from '@nestjs/common';
import { OutboxChannel, OutboxMessageType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { OrderRepository } from '../persistence/repositories/order.repository';
import { OutboxRepository } from '../persistence/repositories/outbox.repository';
import { MessageRelayService } from './message-relay.service'; // PR-05.2
import type { ParsedCommand } from './merchant-command-parser.service';

// ---------------------------------------------------------------------------
// State machine: valid transitions per OrderStatus
// PR-05.1 REQ-19, AC-16
// ---------------------------------------------------------------------------
const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending_payment: ['confirmed', 'cancelled'],
  confirmed: ['paid', 'shipped', 'cancelled'],
  paid: ['shipped'],
  shipped: ['delivered'],
};

function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * MerchantCommandService
 * PR-05.1 — REQ-07..REQ-18
 *
 * Executes validated merchant commands:
 * - Order state transitions (REQ-08..REQ-11, AC-06..AC-09)
 * - Order details / listing (REQ-12..REQ-14, AC-10..AC-12)
 * - Help text (REQ-15, AC-13)
 * - Bot pause/resume (REQ-16..REQ-17, AC-14)
 * - Customer notifications via OutboxMessage (REQ-18, AC-15)
 *
 * Idempotence: commands on already-in-target-status return info message, no duplicate side effects.
 * Ownership: all order lookups include merchantId guard.
 */
@Injectable()
export class MerchantCommandService {
  private readonly logger = new Logger(MerchantCommandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly messageRelayService: MessageRelayService, // PR-05.2
  ) {}

  /**
   * Dispatch a parsed command and return response string for merchant.
   */
  async executeCommand(merchantId: string, command: ParsedCommand): Promise<string> {
    switch (command.command) {
      case 'confirmar':
        return this.confirmOrder(merchantId, command.args['orderCode']!);
      case 'rechazar':
        return this.rejectOrder(merchantId, command.args['orderCode']!, command.args['reason']);
      case 'pagado':
        return this.markAsPaid(merchantId, command.args['orderCode']!);
      case 'enviado':
        return this.markAsShipped(merchantId, command.args['orderCode']!);
      case 'pedido':
        return this.getOrderDetails(merchantId, command.args['orderCode']!);
      case 'pendientes':
        return this.listPendingOrders(merchantId);
      case 'hoy':
        return this.getDailySummary(merchantId);
      case 'ayuda':
        return this.getHelpText();
      case 'pausar_bot':
        return this.pauseBot(merchantId);
      case 'activar_bot':
        return this.activateBot(merchantId);
      // PR-05.2: relay commands
      case 'msg':
        return this.messageRelayService.sendMessageToCustomer(
          merchantId,
          command.args['orderCode']!,
          command.args['text']!,
        );
      case 'handoff':
        return this.messageRelayService.activateHandoff(merchantId, command.args['orderCode']!);
      case 'cerrar_handoff':
        return this.messageRelayService.deactivateHandoff(merchantId);
      default:
        return "❌ Comando no reconocido. Escribe 'ayuda' para ver comandos disponibles.";
    }
  }

  // ---------------------------------------------------------------------------
  // AC-06: confirmar <orderCode>
  // ---------------------------------------------------------------------------
  async confirmOrder(merchantId: string, orderCode: string): Promise<string> {
    const order = await this.orderRepository.findByOrderCode(orderCode, merchantId);
    if (!order) {
      return `❌ Pedido ${orderCode} no encontrado`;
    }

    if (order.status === 'confirmed') {
      return `ℹ️ Pedido ${orderCode} ya está confirmado`;
    }

    if (!isValidTransition(order.status, 'confirmed')) {
      return `❌ No se puede confirmar un pedido con estado "${order.status}"`;
    }

    await this.orderRepository.updateStatus(order.id, 'confirmed');
    await this.notifyCustomer(
      merchantId,
      order.customerId,
      order.customerPhone,
      orderCode,
      `Tu pedido ${orderCode} ha sido confirmado ✅`,
    );

    this.logger.log(`AC-06: Order ${orderCode} confirmed by merchant ${merchantId}`);
    return `✅ Pedido ${orderCode} confirmado\nCliente ${order.customerName} notificado.`;
  }

  // ---------------------------------------------------------------------------
  // AC-07: rechazar <orderCode> [motivo]
  // ---------------------------------------------------------------------------
  async rejectOrder(merchantId: string, orderCode: string, reason?: string): Promise<string> {
    const order = await this.orderRepository.findByOrderCode(orderCode, merchantId);
    if (!order) {
      return `❌ Pedido ${orderCode} no encontrado`;
    }

    if (order.status === 'cancelled') {
      return `ℹ️ Pedido ${orderCode} ya está cancelado`;
    }

    if (!isValidTransition(order.status, 'cancelled')) {
      return `❌ No se puede rechazar un pedido con estado "${order.status}"`;
    }

    await this.orderRepository.updateStatus(order.id, 'cancelled');
    const reasonText = reason ? `: ${reason}` : '';
    await this.notifyCustomer(
      merchantId,
      order.customerId,
      order.customerPhone,
      orderCode,
      `Tu pedido ${orderCode} fue rechazado${reasonText}`,
    );

    this.logger.log(`AC-07: Order ${orderCode} rejected by merchant ${merchantId}`);
    return `✅ Pedido ${orderCode} rechazado\nCliente ${order.customerName} notificado.`;
  }

  // ---------------------------------------------------------------------------
  // AC-08: pagado <orderCode>
  // ---------------------------------------------------------------------------
  async markAsPaid(merchantId: string, orderCode: string): Promise<string> {
    const order = await this.orderRepository.findByOrderCode(orderCode, merchantId);
    if (!order) {
      return `❌ Pedido ${orderCode} no encontrado`;
    }

    if (order.status === 'paid') {
      return `ℹ️ Pedido ${orderCode} ya está marcado como pagado`;
    }

    if (!isValidTransition(order.status, 'paid')) {
      return `❌ No se puede marcar como pagado un pedido con estado "${order.status}"`;
    }

    await this.orderRepository.updateStatus(order.id, 'paid');
    await this.notifyCustomer(
      merchantId,
      order.customerId,
      order.customerPhone,
      orderCode,
      `Pago confirmado para tu pedido ${orderCode} 💳`,
    );

    this.logger.log(`AC-08: Order ${orderCode} marked paid by merchant ${merchantId}`);
    return `✅ Pedido ${orderCode} marcado como pagado\nCliente ${order.customerName} notificado.`;
  }

  // ---------------------------------------------------------------------------
  // AC-09: enviado <orderCode>
  // ---------------------------------------------------------------------------
  async markAsShipped(merchantId: string, orderCode: string): Promise<string> {
    const order = await this.orderRepository.findByOrderCode(orderCode, merchantId);
    if (!order) {
      return `❌ Pedido ${orderCode} no encontrado`;
    }

    if (order.status === 'shipped') {
      return `ℹ️ Pedido ${orderCode} ya está marcado como enviado`;
    }

    if (!isValidTransition(order.status, 'shipped')) {
      return `❌ No se puede marcar como enviado un pedido con estado "${order.status}"`;
    }

    await this.orderRepository.updateStatus(order.id, 'shipped');
    await this.notifyCustomer(
      merchantId,
      order.customerId,
      order.customerPhone,
      orderCode,
      `Tu pedido ${orderCode} ha sido enviado 🚚`,
    );

    this.logger.log(`AC-09: Order ${orderCode} marked shipped by merchant ${merchantId}`);
    return `✅ Pedido ${orderCode} marcado como enviado\nCliente ${order.customerName} notificado.`;
  }

  // ---------------------------------------------------------------------------
  // AC-10: pedido <orderCode>
  // ---------------------------------------------------------------------------
  async getOrderDetails(merchantId: string, orderCode: string): Promise<string> {
    const order = await this.orderRepository.findByOrderCodeWithItems(orderCode, merchantId);
    if (!order) {
      return `❌ Pedido ${orderCode} no encontrado`;
    }

    const itemsText = order.items
      .map(
        (item) =>
          `  • ${item.snapshotName} x${item.quantity} = $${Number(item.unitPrice).toLocaleString('es-CO')}`,
      )
      .join('\n');

    return [
      `📦 Pedido ${orderCode}`,
      `Estado: ${order.status}`,
      `Cliente: ${order.customerName} (${order.customerPhone})`,
      `Dirección: ${order.shippingAddress}`,
      `Pago: ${order.paymentMethod}`,
      ``,
      `Productos:`,
      itemsText,
      ``,
      `Total: $${Number(order.totalAmount).toLocaleString('es-CO')} COP`,
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // AC-11: pendientes
  // ---------------------------------------------------------------------------
  async listPendingOrders(merchantId: string): Promise<string> {
    const orders = await this.orderRepository.findPendingByMerchant(merchantId);
    if (orders.length === 0) {
      return 'ℹ️ No hay pedidos pendientes.';
    }

    const lines = orders.map(
      (o) =>
        `• ${o.orderCode} — ${o.customerName} — $${Number(o.totalAmount).toLocaleString('es-CO')} (${o.status})`,
    );
    return [`📋 Pedidos pendientes (${orders.length}):`, ...lines].join('\n');
  }

  // ---------------------------------------------------------------------------
  // AC-12: hoy
  // ---------------------------------------------------------------------------
  async getDailySummary(merchantId: string): Promise<string> {
    const { count, total } = await this.orderRepository.getDailySummary(merchantId);
    const today = new Date().toISOString().split('T')[0];
    return [
      `📊 Resumen del día (${today}):`,
      `Pedidos: ${count}`,
      `Total: $${total.toLocaleString('es-CO')} COP`,
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // AC-13: ayuda
  // ---------------------------------------------------------------------------
  getHelpText(): string {
    return [
      '🤖 *Comandos disponibles:*',
      '',
      '📦 *Pedidos:*',
      '  confirmar ORD-XXX — confirmar pedido',
      '  rechazar ORD-XXX [motivo] — rechazar pedido',
      '  pagado ORD-XXX — marcar como pagado',
      '  enviado ORD-XXX — marcar como enviado',
      '  pedido ORD-XXX — ver detalles',
      '',
      '📋 *Listados:*',
      '  pendientes — listar pedidos pendientes',
      '  hoy — resumen del día',
      '',
      '⚙️ *Bot:*',
      '  pausar bot — pausar respuestas a clientes',
      '  activar bot — reactivar respuestas',
      '',
      '💬 *Relay (handoff):*',
      '  msg ORD-XXX <texto> — enviar mensaje al cliente',
      '  handoff ORD-XXX — activar relay bidireccional',
      '  cerrar handoff — desactivar relay',
      '',
      '  ayuda — mostrar este menú',
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // AC-14: pausar bot / activar bot
  // ---------------------------------------------------------------------------
  async pauseBot(merchantId: string): Promise<string> {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { botPaused: true },
    });
    this.logger.log(`AC-14: Bot paused for merchant ${merchantId}`);
    return '⏸️ Bot pausado. Los mensajes de clientes no serán procesados hasta que lo reactives.';
  }

  async activateBot(merchantId: string): Promise<string> {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { botPaused: false },
    });
    this.logger.log(`AC-14: Bot activated for merchant ${merchantId}`);
    return '▶️ Bot reactivado. Los mensajes de clientes serán procesados normalmente.';
  }

  // ---------------------------------------------------------------------------
  // Private: notify customer via OutboxMessage
  // AC-15: REQ-18 — enqueue notification to customer phone
  // ---------------------------------------------------------------------------
  private async notifyCustomer(
    merchantId: string,
    customerId: string,
    customerPhone: string,
    orderCode: string,
    message: string,
  ): Promise<void> {
    const dedupeKey = `merchant-cmd-notify-${orderCode}-${message.slice(0, 20).replace(/\s/g, '_')}-${merchantId}`;
    await this.outboxRepository.create({
      merchant: { connect: { id: merchantId } },
      channel: OutboxChannel.WHATSAPP,
      type: OutboxMessageType.SEND_TEXT,
      to: customerPhone,
      payloadJson: { text: message },
      dedupeKey,
    });
    this.logger.log(
      // AC PII: log uses customerId, not phone/name
      `AC-15: Customer notification enqueued for customer ${customerId}, order ${orderCode}`,
    );
  }
}
