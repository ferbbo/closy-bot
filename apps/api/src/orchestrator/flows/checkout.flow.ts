import { Injectable, Logger } from '@nestjs/common';
import { CheckoutService, CheckoutState } from '../../services/checkout.service';
import { MerchantNotificationService } from '../../services/merchant-notification.service';
import { CustomerService } from '../../services/customer.service';
import type { MerchantPlaybookData } from '../../services/playbook.service';

const MAX_INVALID_ATTEMPTS = 3;

/**
 * CheckoutFlow
 * PR-05: Checkout Order Creation — REQ-06, AC-07, AC-08
 *
 * 100% template-first (deterministic). NO LLM calls.
 * Coordinates multi-step checkout conversation:
 *  ASK_NAME → ASK_ADDRESS → SELECT_PAYMENT → CONFIRM → (createOrder) → COMPLETED
 *
 * State is persisted in Conversation.metadata.checkout via CheckoutService.
 */
@Injectable()
export class CheckoutFlow {
  private readonly logger = new Logger(CheckoutFlow.name);

  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly merchantNotificationService: MerchantNotificationService,
    private readonly customerService: CustomerService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public: getActiveState — used by orchestrator to intercept mid-checkout msgs
  // Returns state only if checkout is in progress (not COMPLETED or null)
  // ---------------------------------------------------------------------------
  async getActiveState(conversationId: string): Promise<CheckoutState | null> {
    const state = await this.checkoutService.getCheckoutState(conversationId);
    if (!state || state.step === 'COMPLETED') return null;
    return state;
  }

  // ---------------------------------------------------------------------------
  // Main entry point — called by ConversationOrchestrator
  // ---------------------------------------------------------------------------

  /**
   * Process a checkout-intent message.
   * - If no active checkout state → start new checkout
   * - If active state → continue from current step
   */
  async handle(
    merchant: MerchantPlaybookData,
    conversationId: string,
    customerId: string,
    merchantId: string,
    messageText: string,
  ): Promise<string> {
    this.logger.log(`CheckoutFlow.handle: conversation=${conversationId}, step=resolving`);

    const existingState = await this.checkoutService.getCheckoutState(conversationId);

    // If no state or completed → start fresh checkout
    if (!existingState || existingState.step === 'COMPLETED') {
      return this.handleStart(conversationId, customerId, merchantId);
    }

    // Continue from current step
    return this.handleStep(
      merchant,
      conversationId,
      customerId,
      merchantId,
      messageText,
      existingState,
    );
  }

  // ---------------------------------------------------------------------------
  // Start checkout (validate cart, init state, ask for name)
  // AC-04, AC-13: Reject if cart empty
  // ---------------------------------------------------------------------------

  private async handleStart(
    conversationId: string,
    customerId: string,
    merchantId: string,
  ): Promise<string> {
    const result = await this.checkoutService.startCheckout(conversationId, customerId, merchantId);

    if (!result.ok) {
      this.logger.log(`Checkout rejected: ${result.reason}`);
      return 'Tu carrito está vacío. Primero busca productos y agrégalos con "agregar [producto]".';
    }

    return '¿Cuál es tu nombre completo?';
  }

  // ---------------------------------------------------------------------------
  // Route to the handler for the current step
  // ---------------------------------------------------------------------------

  private async handleStep(
    merchant: MerchantPlaybookData,
    conversationId: string,
    customerId: string,
    merchantId: string,
    text: string,
    state: CheckoutState,
  ): Promise<string> {
    switch (state.step) {
      case 'ASK_NAME':
        return this.handleAskName(conversationId, text);

      case 'ASK_ADDRESS':
        return this.handleAskAddress(conversationId, merchantId, text);

      case 'SELECT_PAYMENT':
        return this.handleSelectPayment(merchant, conversationId, merchantId, text, state);

      case 'CONFIRM':
        return this.handleConfirm(conversationId, customerId, merchantId, text, state);

      default:
        // Unexpected state — restart
        await this.checkoutService.resetCheckoutState(conversationId);
        return this.handleStart(conversationId, customerId, merchantId);
    }
  }

  // ---------------------------------------------------------------------------
  // Step handlers
  // ---------------------------------------------------------------------------

  /** REQ-07 Step 1: Capture customer name */
  private async handleAskName(conversationId: string, text: string): Promise<string> {
    const name = text.trim();
    if (!name || name.length < 2) {
      return 'Por favor, ingresa tu nombre completo (mínimo 2 caracteres).';
    }

    await this.checkoutService.captureField(conversationId, 'name', name);
    return '¿Cuál es tu dirección de entrega?';
  }

  /** REQ-07 Step 2: Capture shipping address and show payment options */
  private async handleAskAddress(
    conversationId: string,
    merchantId: string,
    text: string,
  ): Promise<string> {
    const address = text.trim();
    if (!address || address.length < 5) {
      return 'Por favor, ingresa una dirección de entrega válida.';
    }

    await this.checkoutService.captureField(conversationId, 'address', address);

    const methods = await this.checkoutService.getPaymentMethods(merchantId);
    return this.buildPaymentMethodsPrompt(methods);
  }

  /** REQ-07 Step 3: Show payment methods and capture selection (AC-08) */
  private async handleSelectPayment(
    merchant: MerchantPlaybookData,
    conversationId: string,
    merchantId: string,
    text: string,
    _state: CheckoutState,
  ): Promise<string> {
    const methods = await this.checkoutService.getPaymentMethods(merchantId);

    // If text hasn't been captured yet (state just entered) — show options
    // This is handled by the address step transition: when address is captured,
    // we immediately return payment methods prompt (see handleStep routing)
    // Here we're receiving the user's selection
    const trimmed = text.trim();
    const selectedIndex = parseInt(trimmed, 10) - 1;

    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= methods.length) {
      // Invalid selection
      const updatedState = await this.checkoutService.incrementInvalidAttempts(conversationId);
      if (updatedState.invalidAttempts >= MAX_INVALID_ATTEMPTS) {
        await this.checkoutService.resetCheckoutState(conversationId);
        return 'Checkout cancelado. Escribe "quiero pagar" para intentar de nuevo.';
      }

      return `Por favor selecciona una opción válida:\n` + this.buildPaymentMethodsPrompt(methods);
    }

    const selected = methods[selectedIndex];
    await this.checkoutService.captureField(
      conversationId,
      'paymentMethod',
      selected.type,
      selected.label,
    );

    // Show confirmation summary
    const refreshedState = await this.checkoutService.getCheckoutState(conversationId);
    return this.buildConfirmationSummary(refreshedState!, merchant);
  }

  /** REQ-07 Step 4: Show confirmation + capture "confirmar" */
  private async handleConfirm(
    conversationId: string,
    customerId: string,
    merchantId: string,
    text: string,
    state: CheckoutState,
  ): Promise<string> {
    const trimmed = text.trim().toLowerCase();

    if (!['confirmar', 'si', 'sí', 'yes', 'confirm', 'ok'].includes(trimmed)) {
      return (
        'Responde "confirmar" para finalizar tu pedido, o "cancelar" para salir.\n\n' +
        this.buildConfirmationSummary(state, undefined)
      );
    }

    // REQ-04: createOrder + REQ-09: snapshots
    try {
      const customer = await this.customerService.findById(customerId);
      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }

      const orderResult = await this.checkoutService.createOrder({
        merchantId,
        customerId,
        cartId: state.cartId,
        customerName: state.data.name!,
        customerPhone: customer.phone,
        shippingAddress: state.data.address!,
        paymentMethod: state.data.paymentMethod!,
      });

      // Mark state as completed
      await this.checkoutService.markCompleted(conversationId);

      // REQ-10, AC-11: Notify merchant
      try {
        await this.merchantNotificationService.notifyNewOrder(merchantId, {
          type: 'NEW_ORDER',
          orderCode: orderResult.orderCode,
          customerName: state.data.name!,
          totalAmount: this.merchantNotificationService.formatAmount(orderResult.totalAmount),
          items: orderResult.items.map((i) => ({
            name: i.name,
            qty: i.qty,
            price: this.merchantNotificationService.formatAmount(i.price),
          })),
          shippingAddress: state.data.address!,
          paymentMethod: state.data.paymentMethodLabel ?? state.data.paymentMethod!,
        });
      } catch (notifError) {
        // Notification failure should NOT block order confirmation
        this.logger.error(
          `Failed to send merchant notification for order ${orderResult.orderCode}`,
          notifError,
        );
      }

      return (
        `✅ Tu pedido ${orderResult.orderCode} ha sido registrado. ` +
        `Te contactaremos pronto para confirmar. ¡Gracias!`
      );
    } catch (error) {
      this.logger.error(`Failed to create order for conversation ${conversationId}`, error);
      return 'Hubo un error al procesar tu pedido. Intenta de nuevo en un momento.';
    }
  }

  // ---------------------------------------------------------------------------
  // Helper: build payment methods prompt (AC-08 / AC-13 PR-FE-OB-2)
  // ---------------------------------------------------------------------------
  private buildPaymentMethodsPrompt(
    methods: Array<{ type: string; label: string; paymentLinkUrl?: string }>,
    empty = false,
  ): string {
    if (empty || methods.length === 0) {
      return 'Selecciona tu método de pago:\n1. Contraentrega\n\nResponde con el número.';
    }

    const lines = methods.map((m, i) => {
      const base = `${i + 1}. ${m.label}`;
      // AC-13: include URL for payment_link methods so customer can access it
      if (m.type === 'payment_link' && m.paymentLinkUrl) {
        return `${base}\n   🔗 ${m.paymentLinkUrl}`;
      }
      return base;
    }).join('\n');
    return `Selecciona tu método de pago:\n${lines}\n\nResponde con el número.`;
  }

  // ---------------------------------------------------------------------------
  // Helper: build confirmation summary
  // ---------------------------------------------------------------------------
  private buildConfirmationSummary(
    state: CheckoutState,
    _merchant: MerchantPlaybookData | undefined,
  ): string {
    const paymentLabel = state.data.paymentMethodLabel ?? state.data.paymentMethod ?? 'N/A';
    return (
      `Confirma tu pedido:\n` +
      `👤 Nombre: ${state.data.name ?? 'N/A'}\n` +
      `📍 Dirección: ${state.data.address ?? 'N/A'}\n` +
      `💳 Método de pago: ${paymentLabel}\n\n` +
      `Responde "confirmar" para finalizar.`
    );
  }
}
