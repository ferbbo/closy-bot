import { Injectable, Logger } from '@nestjs/common';
import { CartService } from '../../services/cart.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { ExpectingService } from '../../services/expecting.service';
import type { ExpectingState } from '../types/expecting.types';
import { parseNumericSelection } from '../../common/helpers/selection-helpers';

/**
 * UpdateCartItemFlow
 * PR-04.2: Rewritten — handles quantity modification steps via ExpectingService.
 *
 * Handles:
 * - handleAskQuantity(): show ask-quantity prompt + setExpecting(select_quantity)
 * - handleSelectQuantity(): validate + update quantity + clearExpecting
 */
@Injectable()
export class UpdateCartItemFlow {
  private readonly logger = new Logger(UpdateCartItemFlow.name);

  constructor(
    private readonly cartService: CartService,
    private readonly playbookService: PlaybookService,
    private readonly expectingService: ExpectingService,
  ) {}

  /**
   * AC-07: Show ask-quantity prompt and set expecting(select_quantity).
   * Called by orchestrator when user picks option 2 (modify quantity) from confirm_action menu.
   */
  async handleAskQuantity(
    merchant: MerchantPlaybookData,
    conversationId: string,
    selectedProduct: { id: string; name: string; price?: number },
    currentQty: number,
    maxStock: number,
  ): Promise<string> {
    await this.expectingService.setExpecting(conversationId, {
      flow: 'cart_management',
      type: 'select_quantity',
      data: {
        selectedProduct: {
          id: selectedProduct.id,
          name: selectedProduct.name,
          price: selectedProduct.price ?? 0,
        },
        maxStock,
      },
      expiresAt: ExpectingService.cartSearchExpiresAt(),
    });

    this.logger.debug(
      `UpdateCartItemFlow: select_quantity set for conv=${conversationId} product=${selectedProduct.name} maxStock=${maxStock}`,
    );

    return this.playbookService.getMessage(merchant, 'cartModifyAskQuantity', {
      productName: selectedProduct.name,
      quantity: currentQty,
      stock: maxStock,
    });
  }

  /**
   * AC-09: Handle select_quantity state — validate qty, update cart, clearExpecting.
   * Called by orchestrator when expecting.flow='cart_management' AND type='select_quantity'.
   *
   * AC-11: qty > stock → error message with stock info, NO DB update.
   */
  async handleSelectQuantity(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
    messageText: string,
    expectingState: ExpectingState,
  ): Promise<string> {
    const { selectedProduct, maxStock } = expectingState.data;

    if (!selectedProduct || !selectedProduct.id) {
      await this.expectingService.clearExpecting(conversationId);
      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'actualizar cantidad',
      });
    }

    const stock = maxStock ?? 99;

    // Parse quantity input
    const qty = parseNumericSelection(messageText, stock);

    if (qty === null) {
      // AC-11: Invalid (non-numeric or out of range)
      const rawNum = parseInt(messageText.trim(), 10);
      if (!isNaN(rawNum) && rawNum > stock) {
        // qty > stock
        return this.playbookService.getMessage(merchant, 'cartModifyAskQuantity', {
          productName: selectedProduct.name,
          quantity: rawNum,
          stock,
        });
      }
      // Non-numeric or <= 0
      return this.playbookService.getMessage(merchant, 'cartModifyAskQuantity', {
        productName: selectedProduct.name,
        quantity: 1,
        stock,
      });
    }

    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      await this.cartService.updateQuantity(cart.id, selectedProduct.id, qty);

      await this.expectingService.clearExpecting(conversationId);

      const updatedSummary = await this.cartService.getCartSummary(cart.id);

      const modifyMsg = this.playbookService.getMessage(merchant, 'cartModifySuccess', {
        productName: selectedProduct.name,
        newQuantity: qty,
      });

      const hint = this.playbookService.getMessage(merchant, 'cartManagementHint');

      const itemLines = updatedSummary.items.map(
        (item) => `• *${item.productName}* x${item.quantity} - $${item.subtotal.toFixed(2)}`,
      );
      const cartDisplay = itemLines.join('\n');
      const totalLine = `Total: *$${updatedSummary.total.toFixed(2)}*`;

      return `${modifyMsg}\n\n🛒 Tu carrito:\n${cartDisplay}\n${totalLine}\n\n${hint}`;
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('Stock insuficiente')) {
        // Extract stock number from error message: "Stock insuficiente. Solo quedan N unidades"
        const stockMatch = msg.match(/(\d+)\s+unidades/);
        const actualStock = stockMatch ? parseInt(stockMatch[1], 10) : stock;
        return this.playbookService.getMessage(merchant, 'cartModifyAskQuantity', {
          productName: selectedProduct.name,
          quantity: qty,
          stock: actualStock,
        });
      }
      this.logger.error(`UpdateCartItemFlow.handleSelectQuantity: ${msg}`, (error as Error).stack);
      await this.expectingService.clearExpecting(conversationId);
      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'actualizar cantidad',
      });
    }
  }
}
