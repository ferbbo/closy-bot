import { Injectable, Logger } from '@nestjs/common';
import { CartStatus, OrderStatus, Prisma } from '@prisma/client';
import { CartRepository } from '../persistence/repositories/cart.repository';
import { OrderRepository } from '../persistence/repositories/order.repository';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { PaymentMethodConfig } from '../domain/entities/merchant-config.interface';
import { ExpectingService } from './expecting.service';
import type { ExpectingState, ExpectingType } from '../orchestrator/types/expecting.types';

// ---------------------------------------------------------------------------
// CheckoutState — internal type. Persisted via ExpectingService (PR-04.0).
// AC-05, REQ-05 / REQ-11
// ---------------------------------------------------------------------------
export type CheckoutStep = 'ASK_NAME' | 'ASK_ADDRESS' | 'SELECT_PAYMENT' | 'CONFIRM' | 'COMPLETED';

/** Map CheckoutStep → ExpectingType for persistence */
const STEP_TO_TYPE: Record<Exclude<CheckoutStep, 'COMPLETED'>, ExpectingType> = {
  ASK_NAME: 'input_name',
  ASK_ADDRESS: 'input_address',
  SELECT_PAYMENT: 'select_payment',
  CONFIRM: 'confirm_order',
};

export interface CheckoutState {
  step: CheckoutStep;
  data: {
    name?: string;
    address?: string;
    paymentMethod?: string; // 'cod' | 'transfer' | 'payment_link'
    paymentMethodLabel?: string;
  };
  startedAt: string; // ISO timestamp
  cartId: string;
  invalidAttempts: number; // For payment selection retries
}

// ---------------------------------------------------------------------------
// CreateOrderInput — internal DTO used by createOrder()
// ---------------------------------------------------------------------------
export interface CreateOrderInput {
  merchantId: string;
  customerId: string;
  cartId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  paymentMethod: string;
  notes?: string;
}

/**
 * CheckoutService
 * PR-05: Checkout Order Creation
 *
 * REQ-04: startCheckout(), captureField(), createOrder(), getCheckoutState()
 * REQ-05: State persisted via ExpectingService (PR-04.0 — REQ-11)
 * REQ-03: generateOrderCode() sequential per merchant
 * REQ-09: OrderItems snapshot price + name from CartItem
 * REQ-12: Validates cart not empty before start
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly cartRepository: CartRepository,
    private readonly orderRepository: OrderRepository,
    private readonly expectingService: ExpectingService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // AC-04: startCheckout — validate cart + initialize state
  // REQ-12, AC-13: reject if cart empty
  // ---------------------------------------------------------------------------
  async startCheckout(
    conversationId: string,
    customerId: string,
    merchantId: string,
  ): Promise<{ ok: true; cartId: string } | { ok: false; reason: 'EMPTY_CART' | 'NO_CART' }> {
    const cart = await this.cartRepository.findActiveCart(customerId, merchantId);

    if (!cart) {
      this.logger.log(`No active cart for customer ${customerId}, merchant ${merchantId}`);
      return { ok: false, reason: 'NO_CART' };
    }

    // Count items in cart
    const itemCount = await this.prisma.cartItem.count({
      where: { cartId: cart.id },
    });

    if (itemCount === 0) {
      this.logger.log(`Empty cart ${cart.id} for customer ${customerId}`);
      return { ok: false, reason: 'EMPTY_CART' };
    }

    // Initialize checkout state
    const state: CheckoutState = {
      step: 'ASK_NAME',
      data: {},
      startedAt: new Date().toISOString(),
      cartId: cart.id,
      invalidAttempts: 0,
    };

    await this.persistState(conversationId, state);

    this.logger.log(
      `Checkout started for conversation ${conversationId}, cart ${cart.id}, ${itemCount} items`,
    );
    return { ok: true, cartId: cart.id };
  }

  // ---------------------------------------------------------------------------
  // AC-05 / REQ-05 / REQ-11: getCheckoutState — reads from ExpectingService
  // ---------------------------------------------------------------------------
  async getCheckoutState(conversationId: string): Promise<CheckoutState | null> {
    const state = await this.expectingService.getExpecting(conversationId);
    if (!state || state.flow !== 'checkout') return null;
    return this.fromExpectingState(state);
  }

  // ---------------------------------------------------------------------------
  // REQ-04: captureField — save field value, advance step, persist state
  // ---------------------------------------------------------------------------
  async captureField(
    conversationId: string,
    field: 'name' | 'address' | 'paymentMethod',
    value: string,
    paymentMethodLabel?: string,
  ): Promise<CheckoutState> {
    const state = await this.getCheckoutState(conversationId);
    if (!state) {
      throw new Error(`No checkout state for conversation ${conversationId}`);
    }

    state.data[field] = value;
    if (field === 'paymentMethod' && paymentMethodLabel) {
      state.data.paymentMethodLabel = paymentMethodLabel;
    }

    // Advance step
    if (field === 'name') state.step = 'ASK_ADDRESS';
    else if (field === 'address') state.step = 'SELECT_PAYMENT';
    else if (field === 'paymentMethod') state.step = 'CONFIRM';

    state.invalidAttempts = 0;
    await this.persistState(conversationId, state);
    return state;
  }

  // ---------------------------------------------------------------------------
  // REQ-07: incrementInvalidAttempts — for invalid payment selection retries
  // ---------------------------------------------------------------------------
  async incrementInvalidAttempts(conversationId: string): Promise<CheckoutState> {
    const state = await this.getCheckoutState(conversationId);
    if (!state) throw new Error(`No checkout state for conversation ${conversationId}`);

    state.invalidAttempts = (state.invalidAttempts ?? 0) + 1;
    await this.persistState(conversationId, state);
    return state;
  }

  // ---------------------------------------------------------------------------
  // resetCheckoutState — clear checkout state (for cancelled/abandoned flows)
  // REQ-11: delegates to ExpectingService
  // ---------------------------------------------------------------------------
  async resetCheckoutState(conversationId: string): Promise<void> {
    await this.expectingService.clearExpecting(conversationId);
  }

  // ---------------------------------------------------------------------------
  // REQ-06/07: getPaymentMethods — returns payment methods from MerchantConfig
  // ---------------------------------------------------------------------------
  async getPaymentMethods(merchantId: string): Promise<PaymentMethodConfig[]> {
    const config = await this.prisma.merchantConfig.findUnique({
      where: { merchantId },
      select: { paymentMethods: true },
    });

    if (!config) {
      // Default fallback if no config exists
      return [
        { type: 'cod', label: 'Contraentrega' },
        { type: 'transfer', label: 'Transferencia bancaria' },
      ];
    }

    const methods = config.paymentMethods as unknown as PaymentMethodConfig[];
    return methods.filter((m) => m.type && m.label);
  }

  // ---------------------------------------------------------------------------
  // REQ-01/REQ-08/REQ-09: createOrder — create Order + items + mark Cart completed
  // AC-10: Cart.status = completed
  // AC-09: OrderItem snapshots price + name from CartItem
  // ---------------------------------------------------------------------------
  async createOrder(input: CreateOrderInput): Promise<{
    orderCode: string;
    orderId: string;
    totalAmount: number;
    items: Array<{ name: string; qty: number; price: number }>;
  }> {
    // Load cart with items for snapshot
    const cart = await this.cartRepository.findByIdWithItems(input.cartId);
    if (!cart) {
      throw new Error(`Cart ${input.cartId} not found`);
    }

    if (cart.items.length === 0) {
      throw new Error(`Cart ${input.cartId} is empty`);
    }

    // AC-03: Generate orderCode with retry for collision (REQ-03)
    const orderCode = await this.generateOrderCode(input.merchantId);

    // Calculate total (shippingCost from config if available, else 0)
    const subtotal = cart.items.reduce(
      (sum, item) => sum + Number(item.priceSnapshot) * item.quantity,
      0,
    );

    // AC-09: Build order items with price+name snapshots
    const orderItems: Prisma.OrderItemCreateManyOrderInput[] = cart.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: item.priceSnapshot,
      snapshotName: `${item.variant.product.name} - ${item.variant.name}`, // snapshot
    }));

    // Create order + mark cart completed in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderCode,
          merchant: { connect: { id: input.merchantId } },
          customer: { connect: { id: input.customerId } },
          status: OrderStatus.pending_payment,
          totalAmount: subtotal,
          shippingAddress: input.shippingAddress,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          shippingCost: 0,
          items: { createMany: { data: orderItems } },
        },
        include: { items: true },
      });

      // AC-10: Mark cart as completed
      await tx.cart.update({
        where: { id: input.cartId },
        data: { status: CartStatus.completed },
      });

      return order;
    });

    this.logger.log(
      `Order created: ${result.orderCode} for merchant ${input.merchantId}, total $${subtotal}`,
    );

    const displayItems = cart.items.map((item) => ({
      name: `${item.variant.product.name} - ${item.variant.name}`,
      qty: item.quantity,
      price: Number(item.priceSnapshot),
    }));

    return {
      orderCode: result.orderCode,
      orderId: result.id,
      totalAmount: subtotal,
      items: displayItems,
    };
  }

  // ---------------------------------------------------------------------------
  // REQ-03 / AC-03: Generate sequential orderCode per merchant
  // Format: {prefix}-{padded sequence} e.g. ORD-001
  // Retries on collision (max 3 attempts)
  // ---------------------------------------------------------------------------
  async generateOrderCode(merchantId: string, attempt = 0): Promise<string> {
    if (attempt >= 3) {
      throw new Error(
        `Failed to generate unique orderCode for merchant ${merchantId} after 3 attempts`,
      );
    }

    const config = await this.prisma.merchantConfig.findUnique({
      where: { merchantId },
      select: { orderCodePrefix: true },
    });

    const prefix = config?.orderCodePrefix ?? 'ORD';

    // Count existing orders and add attempt offset for collision retry
    const count = await this.orderRepository.countByMerchant(merchantId);
    const sequence = count + 1 + attempt;
    const padded = String(sequence).padStart(3, '0');
    const orderCode = `${prefix}-${padded}`;

    // Verify not already taken
    const existing = await this.orderRepository.findByOrderCode(orderCode, merchantId);
    if (existing) {
      this.logger.warn(`OrderCode collision: ${orderCode} for merchant ${merchantId}, retrying...`);
      return this.generateOrderCode(merchantId, attempt + 1);
    }

    return orderCode;
  }

  // ---------------------------------------------------------------------------
  // markCompleted — COMPLETED maps to clearExpecting() (REQ-11)
  // ---------------------------------------------------------------------------
  async markCompleted(conversationId: string): Promise<void> {
    await this.expectingService.clearExpecting(conversationId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers — conversion between CheckoutState and ExpectingState
  // REQ-11: no direct metadata access here
  // ---------------------------------------------------------------------------

  private async persistState(conversationId: string, state: CheckoutState): Promise<void> {
    const expectingState = this.toExpectingState(state);
    await this.expectingService.setExpecting(conversationId, expectingState);
  }

  /** Convert CheckoutState (internal) → ExpectingState for persistence */
  private toExpectingState(state: CheckoutState): ExpectingState {
    const type: ExpectingType = state.step === 'COMPLETED' ? 'confirm_order' : STEP_TO_TYPE[state.step];
    return {
      flow: 'checkout',
      type,
      data: {
        cartId: state.cartId,
        checkoutName: state.data.name,
        checkoutAddress: state.data.address,
        checkoutPaymentMethod: state.data.paymentMethod,
        checkoutPaymentMethodLabel: state.data.paymentMethodLabel,
        invalidAttempts: state.invalidAttempts,
        startedAt: state.startedAt,
      },
      expiresAt: ExpectingService.checkoutExpiresAt(),
    };
  }

  /** Convert ExpectingState → CheckoutState (internal) for callers */
  private fromExpectingState(state: ExpectingState): CheckoutState {
    const TYPE_TO_STEP: Record<ExpectingType, CheckoutStep> = {
      input_name: 'ASK_NAME',
      input_address: 'ASK_ADDRESS',
      select_payment: 'SELECT_PAYMENT',
      confirm_order: 'CONFIRM',
      // Non-checkout types default to ASK_NAME (should not occur)
      ask_search_query: 'ASK_NAME',
      select_product: 'ASK_NAME',
      product_options: 'ASK_NAME',
      view_details: 'ASK_NAME',
      select_action: 'ASK_NAME',
      confirm_action: 'ASK_NAME',
      select_quantity: 'ASK_NAME',
    };
    return {
      step: TYPE_TO_STEP[state.type] ?? 'ASK_NAME',
      data: {
        name: state.data.checkoutName,
        address: state.data.checkoutAddress,
        paymentMethod: state.data.checkoutPaymentMethod,
        paymentMethodLabel: state.data.checkoutPaymentMethodLabel,
      },
      startedAt: state.data.startedAt ?? new Date().toISOString(),
      cartId: state.data.cartId ?? '',
      invalidAttempts: state.data.invalidAttempts ?? 0,
    };
  }
}
