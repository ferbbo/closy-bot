import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { CartService } from '../src/services/cart.service';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Cart E2E Tests
 * PR-04: End-to-end tests for conversational cart operations
 */
describe('Cart (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cartService: CartService;

  // Test data setup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testMerchant: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testCustomer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testChannel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testProduct: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testVariant: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    cartService = app.get<CartService>(CartService);

    // Setup test data
    testMerchant = await prisma.merchant.create({
      data: {
        name: 'Test Merchant Cart',
        whatsappNumber: '+5730099999',
        apiKey: 'test-cart-key',
      },
    });

    testCustomer = await prisma.customer.create({
      data: {
        phone: '+5730088888',
        name: 'Test Cart Customer',
      },
    });

    testChannel = await prisma.channel.create({
      data: {
        merchantId: testMerchant.id,
        type: 'WHATSAPP',
        externalId: 'test-cart-phone-id',
        displayName: 'Test Cart Channel',
        credentials: {},
      },
    });

    const category = await prisma.category.create({
      data: {
        name: 'Ropa Cart Test',
        merchantId: testMerchant.id,
      },
    });

    testProduct = await prisma.product.create({
      data: {
        name: 'Camiseta Test',
        description: 'Camiseta de test',
        categoryId: category.id,
        merchantId: testMerchant.id,
        isActive: true,
      },
    });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        sku: 'TEST-CART-SKU',
        name: 'Talla M',
        price: new Decimal(25.99),
        stock: 10,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.cartItem.deleteMany({ where: { cart: { merchantId: testMerchant.id } } });
    await prisma.cart.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.productVariant.deleteMany({ where: { productId: testProduct.id } });
    await prisma.product.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.category.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.conversation.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.channel.deleteMany({ where: { merchantId: testMerchant.id } });
    await prisma.customer.deleteMany({ where: { phone: '+5730088888' } });
    await prisma.merchant.deleteMany({ where: { id: testMerchant.id } });
    await app.close();
  });

  describe('AC-10: Add item via webhook conversation', () => {
    it('should add item to cart conversationally', async () => {
      const messagePayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: testMerchant.id,
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550000000',
                    phone_number_id: testChannel.externalId,
                  },
                  messages: [
                    {
                      from: testCustomer.phone,
                      id: `msg-cart-add-${Date.now()}`,
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: {
                        body: 'agregar camiseta test',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(messagePayload)
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify cart was created and item added
      const cart = await prisma.cart.findFirst({
        where: {
          customerId: testCustomer.id,
          merchantId: testMerchant.id,
          status: 'active',
        },
        include: { items: true },
      });

      expect(cart).toBeDefined();
      expect(cart!.items).toHaveLength(1);
      expect(cart!.items[0].variantId).toBe(testVariant.id);
      expect(cart!.items[0].priceSnapshot.toNumber()).toBe(25.99);
    });
  });

  describe('AC-11: Show cart summary', () => {
    it('should show cart with items', async () => {
      // Ensure cart exists with items from previous test
      await cartService.createOrGetActiveCart(testCustomer.id, testMerchant.id);

      const messagePayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: testMerchant.id,
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550000000',
                    phone_number_id: testChannel.externalId,
                  },
                  messages: [
                    {
                      from: testCustomer.phone,
                      id: `msg-cart-show-${Date.now()}`,
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: {
                        body: 'ver carrito',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(messagePayload)
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify outbound message was queued with cart summary
      const outboxMessage = await prisma.outboxMessage.findFirst({
        where: {
          merchantId: testMerchant.id,
          to: testCustomer.phone,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(outboxMessage).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = outboxMessage!.payloadJson as any;
      expect(payload.text).toContain('Tu carrito');
      expect(payload.text).toContain('Camiseta Test');
    });
  });

  describe('AC-12: Remove item conversationally', () => {
    it('should remove item from cart', async () => {
      const messagePayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: testMerchant.id,
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550000000',
                    phone_number_id: testChannel.externalId,
                  },
                  messages: [
                    {
                      from: testCustomer.phone,
                      id: `msg-cart-remove-${Date.now()}`,
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: {
                        body: 'quitar camiseta',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send(messagePayload)
        .expect(200);

      // Verify item was removed
      const cart = await prisma.cart.findFirst({
        where: {
          customerId: testCustomer.id,
          merchantId: testMerchant.id,
          status: 'active',
        },
        include: { items: true },
      });

      expect(cart!.items).toHaveLength(0);
    });
  });

  describe('AC-06: Stock validation', () => {
    it('should reject add when stock insufficient', async () => {
      // Update stock to 0
      await prisma.productVariant.update({
        where: { id: testVariant.id },
        data: { stock: 0 },
      });

      await expect(
        cartService.addItem(testCustomer.id, testMerchant.id, testVariant.id, 1),
      ).rejects.toThrow('Stock insuficiente');

      // Restore stock
      await prisma.productVariant.update({
        where: { id: testVariant.id },
        data: { stock: 10 },
      });
    });
  });

  describe('AC-02: Idempotency via unique constraint', () => {
    it('should not create duplicate items for same variant', async () => {
      // AC-04: addItem now creates cart internally, no need for explicit createOrGetActiveCart
      // Add same variant twice
      await cartService.addItem(testCustomer.id, testMerchant.id, testVariant.id, 1);
      const cart = await cartService.addItem(testCustomer.id, testMerchant.id, testVariant.id, 1);

      // Should only have one item with quantity = 2
      const updatedCart = await cartService.getCart(cart.id);
      expect(updatedCart.items).toHaveLength(1);
      expect(updatedCart.items[0].quantity).toBe(2);
    });
  });
});
