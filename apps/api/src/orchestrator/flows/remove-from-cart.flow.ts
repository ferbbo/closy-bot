import { Injectable, Logger } from '@nestjs/common';
import { CartService, CartSummary } from '../../services/cart.service';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { ExpectingService } from '../../services/expecting.service';
import type { ExpectingState } from '../types/expecting.types';
import { parseNumericSelection, formatNumberedList } from '../../common/helpers/selection-helpers';

/**
 * RemoveFromCartFlow
 * PR-04.2: Rewritten — multi-step cart management via ExpectingService.
 *
 * Handles:
 * - handleSelectAction(): parses "eliminar N"/"modificar N"/bare-N → confirm menu
 * - handleDirectAction(): direct "eliminar 2" without prior listing → confirm menu
 * - handleConfirmRemove(): option 1 from confirm menu → removes item
 * - handleCancel(): option 3 from confirm menu → cancels
 */
@Injectable()
export class RemoveFromCartFlow {
  private readonly logger = new Logger(RemoveFromCartFlow.name);

  // Regex patterns for direct action extraction within select_action state
  private readonly REMOVE_PATTERN = /(eliminar|quitar|sacar)\s+(\d+)/i;
  private readonly MODIFY_PATTERN = /modificar\s+(\d+)/i;
  private readonly CANCEL_PATTERN = /cancelar/i;

  constructor(
    private readonly cartService: CartService,
    private readonly playbookService: PlaybookService,
    private readonly expectingService: ExpectingService,
  ) {}

  /**
   * AC-05: Handle select_action state.
   * Called by orchestrator when expecting.flow='cart_management' AND type='select_action'.
   */
  async handleSelectAction(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
    messageText: string,
    expectingState: ExpectingState,
  ): Promise<string> {
    const cartItems = expectingState.data.cartItems ?? [];

    if (cartItems.length === 0) {
      await this.expectingService.clearExpecting(conversationId);
      return this.playbookService.getMessage(merchant, 'cartEmpty');
    }

    // Parse action and index from message
    let action: 'remove' | 'modify' | 'cancel' = 'remove';
    let selectedIndex: number | null = null;

    const removeMatch = messageText.match(this.REMOVE_PATTERN);
    const modifyMatch = messageText.match(this.MODIFY_PATTERN);
    const cancelMatch = messageText.match(this.CANCEL_PATTERN);


     this.logger.debug(`messageText: ${messageText}`)
    if (removeMatch) {
      action = 'remove';
      selectedIndex = parseInt(removeMatch[2], 10);
    } else if (modifyMatch) {
      action = 'modify';
      selectedIndex = parseInt(modifyMatch[1], 10);
    } else if (cancelMatch) {
      action = 'cancel'
    } else {
      // Try bare number
      const bare = parseNumericSelection(messageText, cartItems.length);
      if (bare !== null) {
        action = 'remove';
        selectedIndex = bare;
      }
    }
     this.logger.debug(`${selectedIndex} \\\ ${action}`)
    if (selectedIndex == null && action === 'cancel') {
      return this.handleCancel(merchant, conversationId)
    }
    // AC-10: Validate index
    if (selectedIndex === null || selectedIndex < 1 || selectedIndex > cartItems.length) {
      return this.playbookService.getMessage(merchant, 'cartItemNotFound');
    }

    const selectedItem = cartItems[selectedIndex - 1];

    // Build confirm menu + setExpecting(confirm_action)
    const confirmMessage = this.playbookService.getMessage(merchant, 'cartActionConfirmPrompt', {
      productName: selectedItem.name,
    });

    await this.expectingService.setExpecting(conversationId, {
      flow: 'cart_management',
      type: 'confirm_action',
      data: {
        cartItems,
        pendingAction: action,
        selectedItemIndex: selectedIndex,
      },
      expiresAt: ExpectingService.cartSearchExpiresAt(),
    });

    this.logger.debug(
      `RemoveFromCartFlow: confirm_action set for conv=${conversationId} action=${action} idx=${selectedIndex}`,
    );

    return confirmMessage;
  }

  /**
   * AC-02 / Happy Path B: Handle direct cart action (regex with number, no prior listing).
   * Called when orchestrator detects "eliminar N" / "modificar N" without active expecting.
   */
  async handleDirectAction(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
    cartAction: { action: 'remove' | 'modify'; index: number },
  ): Promise<string> {
    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      const summary = await this.cartService.getCartSummary(cart.id);

      if (summary.items.length === 0) {
        return this.playbookService.getMessage(merchant, 'cartEmpty');
      }

      const { action, index } = cartAction;

      // AC-10: Validate index
      if (index < 1 || index > summary.items.length) {
        return this.playbookService.getMessage(merchant, 'cartItemNotFound');
      }

      const selectedItem = summary.items[index - 1];
      const cartItems = summary.items.map((item) => ({
        id: item.id,
        name: item.productName,
        qty: item.quantity,
      }));

      const confirmMessage = this.playbookService.getMessage(merchant, 'cartActionConfirmPrompt', {
        productName: selectedItem.productName,
      });

      await this.expectingService.setExpecting(conversationId, {
        flow: 'cart_management',
        type: 'confirm_action',
        data: {
          cartItems,
          pendingAction: action,
          selectedItemIndex: index,
        },
        expiresAt: ExpectingService.cartSearchExpiresAt(),
      });

      return confirmMessage;
    } catch (error) {
      this.logger.error(
        `RemoveFromCartFlow.handleDirectAction: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'gestionar carrito',
      });
    }
  }

  /**
   * AC-06: Execute item removal (option 1 from confirm_action menu).
   * Removes item, shows updated cart, clears expecting.
   */
  async handleConfirmRemove(
    merchant: MerchantPlaybookData,
    customerId: string,
    merchantId: string,
    conversationId: string,
    itemId: string,
    productName: string,
  ): Promise<string> {
    try {
      const cart = await this.cartService.createOrGetActiveCart(customerId, merchantId);
      await this.cartService.removeItem(cart.id, itemId);

      await this.expectingService.clearExpecting(conversationId);

      // Get updated cart
      const updatedSummary = await this.cartService.getCartSummary(cart.id);

      const removeMsg = this.playbookService.getMessage(merchant, 'cartRemoveSuccess', {
        productName,
      });

      const hint = this.playbookService.getMessage(merchant, 'cartManagementHint');

      if (updatedSummary.items.length === 0) {
        return `${removeMsg}\n\n${this.playbookService.getMessage(merchant, 'cartEmpty')}`;
      }

      const itemLines = updatedSummary.items.map(
        (item) => `• *${item.productName}* x${item.quantity} - $${item.subtotal.toFixed(2)}`,
      );
      const cartDisplay = itemLines.join('\n');
      const totalLine = `Total: *$${updatedSummary.total.toFixed(2)}*`;

      return `${removeMsg}\n\n🛒 Tu carrito:\n${cartDisplay}\n${totalLine}\n\n${hint}`;
    } catch (error) {
      this.logger.error(
        `RemoveFromCartFlow.handleConfirmRemove: ${(error as Error).message}`,
        (error as Error).stack,
      );
      await this.expectingService.clearExpecting(conversationId);
      return this.playbookService.getMessage(merchant, 'genericError', {
        action: 'eliminar del carrito',
      });
    }
  }

  /**
   * AC-08: Cancel action (option 3 from confirm_action menu).
   * No changes to cart. Clears expecting.
   */
  async handleCancel(merchant: MerchantPlaybookData, conversationId: string): Promise<string> {
    await this.expectingService.clearExpecting(conversationId);
    return this.playbookService.getMessage(merchant, 'cartActionCancelled');
  }

  /**
   * Build numbered cart display helper
   */
  formatCartList(summary: CartSummary): string {
    const itemLines = summary.items.map(
      (item) => `*${item.productName}* - ${item.variantName} (x${item.quantity})`,
    );
    return formatNumberedList(itemLines);
  }
}
