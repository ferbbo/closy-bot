/**
 * Test util (S3.1): DeliveryTools reales sobre una BD en memoria (Prisma mockeado).
 * MerchantConfig.deliveryConfig, Conversation.metadata y el carrito activo viven en `db`
 * y se leen en cada llamada, como en producción (RN-00).
 */
import type { PrismaService } from '../../../../persistence/prisma/prisma.service';
import type { CartService } from '../../../../services/cart.service';
import type { CartWithItems } from '../../../../persistence/repositories/cart.repository';
import { DeliveryConfigService } from '../../config/delivery-config.service';
import { buildRestauranteDefaults } from '../../config/restaurante.defaults';
import type { DeliveryConfig, DeliveryTurnContext, DeliveryZone } from '../../contracts';
import { CartPresenter } from '../../presenters/cart.presenter';
import { DeliveryTools } from '../../agent/tools/delivery.tools';
import { CheckoutDraftStore } from '../checkout-draft.store';
import { DeliveryQuoteService } from '../delivery-quote.service';

export const TEST_ZONES: DeliveryZone[] = [
  { id: 'cabecera', name: 'Cabecera', aliases: ['cabecera del llano'], fee: 4000, minOrder: 15000, etaMinutes: 20 },
  { id: 'provenza', name: 'Provenza', aliases: [], fee: 5000, minOrder: 15000, etaMinutes: 25 },
  { id: 'canaveral', name: 'Cañaveral', aliases: [], fee: 6000, minOrder: 30000, etaMinutes: 30 },
]; // prettier-ignore

export interface FakeDeliveryDb {
  deliveryConfig: DeliveryConfig;
  metadata: Record<string, unknown> | null;
  cartId: string;
  /** Líneas del carrito activo: precio unitario y cantidad. */
  lines: Array<{ price: number; quantity: number }>;
}

export function buildDeliveryToolsHarness(db: Partial<FakeDeliveryDb> = {}) {
  const state: FakeDeliveryDb = {
    deliveryConfig: {
      ...buildRestauranteDefaults(),
      zones: TEST_ZONES,
      prepTimeMinutes: 25,
      pickupEnabled: true,
    },
    metadata: null,
    cartId: 'cart-1',
    lines: [{ price: 16000, quantity: 2 }],
    ...db,
  };
  const prisma = {
    merchantConfig: {
      findUnique: jest.fn(async () => ({
        deliveryConfig: JSON.parse(JSON.stringify(state.deliveryConfig)) as unknown,
        paymentMethods: [],
      })),
    },
    conversation: {
      findUnique: jest.fn(async () => ({
        metadata: state.metadata === null ? null : JSON.parse(JSON.stringify(state.metadata)),
      })),
      update: jest.fn(async (args: { data: { metadata: Record<string, unknown> } }) => {
        state.metadata = JSON.parse(JSON.stringify(args.data.metadata)) as Record<string, unknown>;
        return {};
      }),
    },
  };
  const cartService = {
    createOrGetActiveCart: jest.fn(
      async () =>
        ({
          id: state.cartId,
          items: state.lines.map((l, i) => ({
            id: `item-${i}`,
            variantId: `v-${i}`,
            notes: '',
            quantity: l.quantity,
            priceSnapshot: l.price,
            variant: { name: 'Única', product: { name: `Producto ${i}` } },
          })),
        }) as unknown as CartWithItems,
    ),
  };
  const configService = new DeliveryConfigService(prisma as unknown as PrismaService);
  const drafts = new CheckoutDraftStore(prisma as unknown as PrismaService);
  const tools = new DeliveryTools(
    drafts,
    new DeliveryQuoteService(configService),
    configService,
    cartService as unknown as CartService,
    new CartPresenter(),
  );
  const ctx: DeliveryTurnContext = {
    merchantId: 'm-1',
    customerId: 'c-1',
    conversationId: 'conv-1',
    customerPhone: '+573000000101',
    text: '',
    config: state.deliveryConfig,
    now: new Date('2026-11-27T20:00:00-05:00'),
    seenVariantIds: new Set<string>(),
  };
  const draft = () =>
    ((state.metadata?.delivery as Record<string, unknown> | undefined)?.checkout ?? null) as Record<
      string,
      unknown
    > | null;
  return { state, prisma, cartService, tools, handlers: tools.handlers(), ctx, draft };
}
