import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartStatus } from '@prisma/client';
import { CartRepository, CartWithItems } from '../persistence/repositories/cart.repository';
import { CartItemRepository } from '../persistence/repositories/cart-item.repository';
import { ProductRepository } from '../persistence/repositories/product.repository';
import { MerchantResolverService } from './merchant-resolver.service';

/**
 * CartSummary DTO for conversational display
 */
export interface CartSummary {
  items: Array<{
    id: string;
    productName: string;
    variantName: string;
    quantity: number;
    priceSnapshot: number;
    subtotal: number;
  }>;
  total: number;
  itemCount: number;
}

/**
 * CartService handles shopping cart operations
 * PR-04: Cart CRUD conversacional
 *
 * Guardrails:
 * - Precio siempre capturado desde ProductVariant.price (REQ-15)
 * - Stock validado antes de agregar (REQ-16)
 * - TTL respetado al crear carrito (REQ-17)
 */
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private readonly defaultTtlHours: number;

  constructor(
    private readonly cartRepository: CartRepository,
    private readonly cartItemRepository: CartItemRepository,
    private readonly productRepository: ProductRepository,
    private readonly merchantResolverService: MerchantResolverService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTtlHours = this.configService.get<number>('CART_TTL_HOURS', 24);
  }

  /**
   * AC-03: Create or get active cart for customer/merchant
   * REQ-03: Returns existing active cart or creates new one with TTL
   * AC-13: TTL configurable by playbook (default 24h)
   */
  async createOrGetActiveCart(customerId: string, merchantId: string): Promise<CartWithItems> {
    // Check for existing active cart
    const existingCart = await this.cartRepository.findActiveCart(customerId, merchantId);

    if (existingCart) {
      // Return with items
      const cartWithItems = await this.cartRepository.findByIdWithItems(existingCart.id);
      if (cartWithItems) {
        this.logger.log(`Reusing active cart ${existingCart.id} for customer ${customerId}`);
        return cartWithItems;
      }
    }

    // AC-13: Get TTL from playbook config, fallback to env var or default 24h
    const merchant = await this.merchantResolverService.getMerchant(merchantId);
    const ttlHours = merchant.playbookConfig?.cartConfig?.ttlHours ?? this.defaultTtlHours;

    // Create new cart with TTL (REQ-17, AC-18)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    const newCart = await this.cartRepository.create({
      customer: { connect: { id: customerId } },
      merchant: { connect: { id: merchantId } },
      status: CartStatus.active,
      expiresAt,
    });

    this.logger.log(
      `Created new cart ${newCart.id} for customer ${customerId}, TTL ${ttlHours}h, expires at ${expiresAt.toISOString()}`,
    );

    // Return with empty items
    const cartWithItems = await this.cartRepository.findByIdWithItems(newCart.id);
    if (!cartWithItems) {
      throw new Error('Failed to fetch newly created cart');
    }

    return cartWithItems;
  }

  /**
   * AC-04, AC-05, AC-16, AC-17: Add item to cart with stock validation and price snapshot
   * REQ-04: Validates stock and captures real price from ProductVariant
   *
   * Guardrails:
   * - priceSnapshot always from variant.price (no manual override)
   * - Stock validated before adding
   *
   * @throws BadRequestException if stock insufficient
   * @throws NotFoundException if variant not found
   */
  async addItem(cartId: string, variantId: string, quantity: number): Promise<CartWithItems> {
    if (quantity < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    // Fetch variant to validate stock and get real price (REQ-15, AC-16)
    const product = await this.productRepository.findByVariantId(variantId);
    if (!product) {
      throw new NotFoundException(`Product variant ${variantId} not found`);
    }

    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) {
      throw new NotFoundException(`Variant ${variantId} not found`);
    }

    // Guardrail: Validate stock (REQ-16, AC-17)
    if (variant.stock < quantity) {
      throw new BadRequestException(
        `Stock insuficiente. Solo quedan ${variant.stock} unidades de ${product.name} - ${variant.name}`,
      );
    }

    // Check if item already exists (idempotency via unique constraint)
    const existingItem = await this.cartItemRepository.findByCartAndVariant(cartId, variantId);

    if (existingItem) {
      // Increment quantity instead of creating duplicate
      const newQuantity = existingItem.quantity + quantity;

      // Re-validate stock for new quantity
      if (variant.stock < newQuantity) {
        throw new BadRequestException(
          `Stock insuficiente. Solo quedan ${variant.stock} unidades (tienes ${existingItem.quantity} en carrito)`,
        );
      }

      await this.cartItemRepository.updateQuantity(existingItem.id, newQuantity);
      this.logger.log(
        `Updated item quantity in cart ${cartId}: variant ${variantId} -> ${newQuantity}`,
      );
    } else {
      // Create new item with price snapshot (REQ-15, AC-04)
      try {
        await this.cartItemRepository.create({
          cart: { connect: { id: cartId } },
          variant: { connect: { id: variantId } },
          quantity,
          priceSnapshot: variant.price, // Guardrail: always from variant.price
        });
        this.logger.log(
          `Added item to cart ${cartId}: variant ${variantId} x${quantity} @ ${variant.price.toString()}`,
        );
      } catch (error: unknown) {
        // Handle P2002 (unique constraint violation) for concurrent addItem calls
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          this.logger.warn(
            `Concurrent add detected for cart ${cartId} variant ${variantId}, retrying as update`,
          );
          // Re-fetch cart items to get the item created by the concurrent call
          const freshCart = await this.cartRepository.findByIdWithItems(cartId);
          if (!freshCart) {
            throw new Error('Cart not found after concurrent creation');
          }
          const nowExistingItem = freshCart.items.find((item) => item.variant.id === variantId);
          if (nowExistingItem) {
            const newQuantity = nowExistingItem.quantity + quantity;

            // REQ-16/AC-17: Re-validate stock for new quantity (concurrency guardrail)
            if (variant.stock < newQuantity) {
              throw new BadRequestException(
                `Stock insuficiente. Solo quedan ${variant.stock} unidades (tienes ${nowExistingItem.quantity} en carrito)`,
              );
            }

            await this.cartItemRepository.updateQuantity(nowExistingItem.id, newQuantity);
            this.logger.log(
              `Resolved concurrent add via update: cart ${cartId}, variant ${variantId} -> ${newQuantity}`,
            );
          } else {
            throw new Error('Item not found after P2002, data inconsistency');
          }
        } else {
          // Re-throw other errors
          throw error;
        }
      }
    }

    // AC-13: Refresh TTL on cart operations (extend expiresAt)
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + this.cartTtlHours);
    await this.cartRepository.refreshTTL(cartId, newExpiresAt);

    // Return updated cart with items
    const updatedCart = await this.cartRepository.findByIdWithItems(cartId);
    if (!updatedCart) {
      throw new Error('Failed to fetch updated cart');
    }

    return updatedCart;
  }

  /**
   * AC-06: Update item quantity
   * REQ-05: Adjusts quantity (if qty=0, removes item)
   *
   * @param cartId - Cart ID
   * @param itemId - CartItem ID
   * @param quantity - New quantity (0 = remove)
   * @returns Updated cart or null if item removed
   */
  async updateQuantity(
    cartId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartWithItems | null> {
    if (quantity < 0) {
      throw new BadRequestException('Quantity cannot be negative');
    }

    const item = await this.cartItemRepository.findById(itemId);
    if (!item || item.cartId !== cartId) {
      throw new NotFoundException(`Cart item ${itemId} not found in cart ${cartId}`);
    }

    // If quantity is 0, remove item
    if (quantity === 0) {
      await this.cartItemRepository.delete(itemId);
      this.logger.log(`Removed item ${itemId} from cart ${cartId} (quantity set to 0)`);

      const updatedCart = await this.cartRepository.findByIdWithItems(cartId);
      return updatedCart;
    }

    // Validate stock for new quantity
    const product = await this.productRepository.findByVariantId(item.variantId);
    if (!product) {
      throw new NotFoundException(`Product for variant ${item.variantId} not found`);
    }

    const variant = product.variants.find((v) => v.id === item.variantId);
    if (!variant) {
      throw new NotFoundException(`Variant ${item.variantId} not found`);
    }

    if (variant.stock < quantity) {
      throw new BadRequestException(`Stock insuficiente. Solo quedan ${variant.stock} unidades`);
    }

    await this.cartItemRepository.updateQuantity(itemId, quantity);
    this.logger.log(`Updated item ${itemId} quantity to ${quantity} in cart ${cartId}`);

    // AC-13: Refresh TTL on cart operations
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + this.cartTtlHours);
    await this.cartRepository.refreshTTL(cartId, newExpiresAt);

    const updatedCart = await this.cartRepository.findByIdWithItems(cartId);
    return updatedCart;
  }

  /**
   * AC-07: Remove item from cart
   * REQ-06: Deletes item by ID
   */
  async removeItem(cartId: string, itemId: string): Promise<CartWithItems> {
    const item = await this.cartItemRepository.findById(itemId);
    if (!item || item.cartId !== cartId) {
      throw new NotFoundException(`Cart item ${itemId} not found in cart ${cartId}`);
    }

    await this.cartItemRepository.delete(itemId);
    this.logger.log(`Removed item ${itemId} from cart ${cartId}`);

    // AC-13: Refresh TTL on cart operations
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + this.cartTtlHours);
    await this.cartRepository.refreshTTL(cartId, newExpiresAt);

    const updatedCart = await this.cartRepository.findByIdWithItems(cartId);
    if (!updatedCart) {
      throw new Error('Failed to fetch updated cart after removing item');
    }

    return updatedCart;
  }

  /**
   * AC-08: Get cart summary with totals
   * REQ-07: Returns items with calculated subtotal and total
   */
  async getCartSummary(cartId: string): Promise<CartSummary> {
    const cart = await this.cartRepository.findByIdWithItems(cartId);
    if (!cart) {
      throw new NotFoundException(`Cart ${cartId} not found`);
    }

    const items = cart.items.map((item) => ({
      id: item.id,
      productName: item.variant.product.name,
      variantName: item.variant.name,
      quantity: item.quantity,
      priceSnapshot: item.priceSnapshot.toNumber(),
      subtotal: item.priceSnapshot.toNumber() * item.quantity,
    }));

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      items,
      total,
      itemCount,
    };
  }

  /**
   * Get cart by ID with items
   */
  async getCart(cartId: string): Promise<CartWithItems> {
    const cart = await this.cartRepository.findByIdWithItems(cartId);
    if (!cart) {
      throw new NotFoundException(`Cart ${cartId} not found`);
    }
    return cart;
  }

  /**
   * Mark expired carts as abandoned (called by cleanup job)
   * AC-19: Cleanup job
   */
  async markExpiredCartsAsAbandoned(): Promise<number> {
    const expiredCarts = await this.cartRepository.findExpiredCarts();

    for (const cart of expiredCarts) {
      await this.cartRepository.updateStatus(cart.id, CartStatus.abandoned);
      this.logger.log(`Marked expired cart ${cart.id} as abandoned`);
    }

    return expiredCarts.length;
  }
}
